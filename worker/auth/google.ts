// Google sign-in (OpenID Connect authorization code flow with PKCE).
import { fromBase64url, utf8 } from '../lib/encoding';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export function googleAuthUrl(opts: { clientId: string; redirectUri: string; state: string; nonce: string; codeChallenge: string }): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: opts.state,
    nonce: opts.nonce,
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

export async function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      code_verifier: opts.codeVerifier,
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !body.id_token) throw new Error(`Google token exchange failed (${res.status} ${body.error ?? ''})`);
  return body.id_token;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

let keyCache: { keys: Jwk[]; expires: number } | null = null;

async function signingKeys(refresh: boolean): Promise<Jwk[]> {
  if (!refresh && keyCache && keyCache.expires > Date.now()) return keyCache.keys;
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error(`Could not fetch Google signing keys (${res.status})`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  keyCache = { keys, expires: Date.now() + maxAge * 1000 };
  return keys;
}

export interface GoogleClaims {
  sub: string;
  email: string;
  email_verified: boolean | string;
  name?: string;
  given_name?: string;
  aud: string;
  iss: string;
  exp: number;
  iat?: number;
  nonce?: string;
}

const decodeJson = <T>(part: string): T => JSON.parse(new TextDecoder().decode(fromBase64url(part))) as T;

/** Verifies the ID token's RS256 signature against Google's keys, then its claims. */
export async function verifyIdToken(idToken: string, opts: { clientId: string; nonce: string; now?: number }): Promise<GoogleClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token');
  const [h, p, s] = parts as [string, string, string];
  const header = decodeJson<{ alg?: string; kid?: string }>(h);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected ID token algorithm');

  let jwk = (await signingKeys(false)).find((k) => k.kid === header.kid);
  jwk ??= (await signingKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown ID token signing key');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64url(s), utf8(`${h}.${p}`)))) {
    throw new Error('Invalid ID token signature');
  }

  const claims = decodeJson<GoogleClaims>(p);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!ISSUERS.has(claims.iss)) throw new Error('Invalid ID token issuer');
  if (claims.aud !== opts.clientId) throw new Error('ID token is for another client');
  if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw new Error('ID token expired');
  if (claims.nonce !== opts.nonce) throw new Error('ID token nonce mismatch');
  if (!claims.sub || !claims.email) throw new Error('ID token missing subject or email');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new Error('Google email not verified');
  return claims;
}
