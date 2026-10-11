import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MeResponse } from '../shared/api';
import { GOOGLE_JWKS_URL, GOOGLE_TOKEN_URL } from '../worker/auth/google';
import { base64url, utf8 } from '../worker/lib/encoding';
import { safeReturnTo } from '../worker/routes/auth';
import { createTestEnv, signUp, TestClient } from './helpers/env';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
let t: Awaited<ReturnType<typeof createTestEnv>>;
let googleKey: CryptoKeyPair;
let jwk: JsonWebKey & { kid: string };
let nextIdToken: (verifierCheck: string) => Promise<string>;
let tokenRequests: URLSearchParams[] = [];
const realFetch = globalThis.fetch;

async function signIdToken(claims: Record<string, unknown>, key = googleKey.privateKey, kid = 'test-kid') {
  const header = base64url(utf8(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
  const payload = base64url(utf8(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(sig))}`;
}

const rsa = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

beforeAll(async () => {
  googleKey = (await crypto.subtle.generateKey(rsa, true, ['sign', 'verify'])) as CryptoKeyPair;
  jwk = { ...((await crypto.subtle.exportKey('jwk', googleKey.publicKey)) as JsonWebKey), kid: 'test-kid' };
  t = await createTestEnv({ GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: 'shh' });
  // Play Google's token and key endpoints.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === GOOGLE_JWKS_URL) return Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'public, max-age=3600' } });
    if (url === GOOGLE_TOKEN_URL) {
      const params = new URLSearchParams(String(init?.body));
      tokenRequests.push(params);
      if (params.get('code') === 'bad-code') return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ id_token: await nextIdToken(params.get('code_verifier') ?? ''), access_token: 'x' });
    }
    return realFetch(input, init);
  }) as typeof fetch;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await t?.dispose();
});

beforeEach(() => {
  tokenRequests = [];
});

/** Runs the redirect dance; `claims` customizes the ID token Google returns. */
async function googleSignIn(client: TestClient, claims: (nonce: string) => Record<string, unknown>, opts: { returnTo?: string; code?: string; tamperState?: boolean } = {}) {
  const start = await client.get(`/api/auth/google?returnTo=${encodeURIComponent(opts.returnTo ?? '/')}&tz=Europe/Paris`);
  expect(start.status).toBe(302);
  const auth = new URL(start.headers.get('location')!);
  expect(auth.origin + auth.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  const p = auth.searchParams;
  expect(p.get('client_id')).toBe(CLIENT_ID);
  expect(p.get('redirect_uri')).toBe('http://localhost/api/auth/google/callback');
  expect(p.get('response_type')).toBe('code');
  expect(p.get('scope')).toBe('openid email profile');
  expect(p.get('code_challenge_method')).toBe('S256');
  const challenge = p.get('code_challenge')!;
  nextIdToken = async (verifier) => {
    // PKCE: the verifier sent to the token endpoint must hash to the challenge.
    const hashed = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(verifier))));
    expect(hashed).toBe(challenge);
    return signIdToken(claims(p.get('nonce')!));
  };
  const state = opts.tamperState ? 'not-the-state' : p.get('state');
  return client.get(`/api/auth/google/callback?code=${opts.code ?? 'good-code'}&state=${state}`);
}

const goodClaims = (sub: string, email: string) => (nonce: string) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub,
  email,
  email_verified: true,
  given_name: 'Robin',
  name: 'Robin Example',
  nonce,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

describe('Google sign-in', () => {
  it('signs in, creates the account once, and returns to the requested page', async () => {
    const client = new TestClient(t.env, t.ctx);
    const done = await googleSignIn(client, goodClaims('google-sub-1', 'Robin@Example.com'), { returnTo: '/join/ABC234' });
    expect(done.status).toBe(302);
    expect(done.headers.get('location')).toBe('/join/ABC234');
    expect(tokenRequests[0]!.get('client_secret')).toBe('shh');
    expect(tokenRequests[0]!.get('redirect_uri')).toBe('http://localhost/api/auth/google/callback');

    const me = await client.get<MeResponse>('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ name: 'Robin', email: 'robin@example.com', timezone: 'Europe/Paris', isAdmin: false });
    expect(me.raw).not.toMatch(/password/i);

    // Signing in again (new device, changed email) finds the same account and keeps the chosen name.
    await client.patch('/api/me', { name: 'Rob' });
    const again = new TestClient(t.env, t.ctx);
    await googleSignIn(again, goodClaims('google-sub-1', 'robin.new@example.com'));
    const me2 = await again.get<MeResponse>('/api/me');
    expect(me2.body.user).toMatchObject({ id: me.body.user.id, name: 'Rob', email: 'robin.new@example.com' });
    const identities = await t.env.DB.prepare(`SELECT COUNT(*) AS n FROM identities WHERE provider = 'google'`).first<{ n: number }>();
    expect(identities?.n).toBe(1);
  });

  it('rejects tampered state, bad tokens and unverified emails', async () => {
    const cases: [string, (nonce: string) => Record<string, unknown>, { tamperState?: boolean; code?: string }][] = [
      ['expired', goodClaims('s2', 'x@example.com'), { tamperState: true }],
      ['failed', (n) => ({ ...goodClaims('s3', 'x@example.com')(n), aud: 'someone-else' }), {}],
      ['failed', (n) => ({ ...goodClaims('s4', 'x@example.com')(n), nonce: `${n}-replayed` }), {}],
      ['failed', (n) => ({ ...goodClaims('s5', 'x@example.com')(n), email_verified: false }), {}],
      ['failed', (n) => ({ ...goodClaims('s6', 'x@example.com')(n), exp: Math.floor(Date.now() / 1000) - 600 }), {}],
      ['failed', (n) => ({ ...goodClaims('s7', 'x@example.com')(n), iss: 'https://evil.example' }), {}],
      ['failed', goodClaims('s8', 'x@example.com'), { code: 'bad-code' }],
    ];
    for (const [error, claims, opts] of cases) {
      const client = new TestClient(t.env, t.ctx);
      const res = await googleSignIn(client, claims, opts);
      expect(res.headers.get('location'), JSON.stringify(opts)).toBe(`/?auth_error=${error}`);
      expect((await client.get('/api/me')).status).toBe(401);
    }
    const users = await t.env.DB.prepare(`SELECT COUNT(*) AS n FROM identities WHERE subject IN ('s2','s3','s4','s5','s6','s7','s8')`).first<{ n: number }>();
    expect(users?.n).toBe(0);
  });

  it('rejects tokens signed by anyone but Google', async () => {
    const forger = (await crypto.subtle.generateKey(rsa, true, ['sign', 'verify'])) as CryptoKeyPair;
    const client = new TestClient(t.env, t.ctx);
    const start = await client.get('/api/auth/google');
    const p = new URL(start.headers.get('location')!).searchParams;
    nextIdToken = () => signIdToken(goodClaims('forged', 'f@example.com')(p.get('nonce')!), forger.privateKey);
    const res = await client.get(`/api/auth/google/callback?code=c&state=${p.get('state')}`);
    expect(res.headers.get('location')).toBe('/?auth_error=failed');
  });

  it('handles a cancelled consent screen and a missing flow cookie', async () => {
    const client = new TestClient(t.env, t.ctx);
    const start = await client.get('/api/auth/google');
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    expect((await client.get(`/api/auth/google/callback?error=access_denied&state=${state}`)).headers.get('location')).toBe('/?auth_error=cancelled');
    const stranger = new TestClient(t.env, t.ctx);
    expect((await stranger.get(`/api/auth/google/callback?code=x&state=${state}`)).headers.get('location')).toBe('/?auth_error=expired');
  });

  it('uses __Host- cookies over HTTPS', async () => {
    const client = new TestClient(t.env, t.ctx, 'https://relationshipper.example');
    const start = await client.get('/api/auth/google');
    expect(start.headers.getSetCookie().join('\n')).toMatch(/__Host-rs_oauth=[^;]+;.*Path=\/;.*HttpOnly;.*Secure;.*SameSite=Lax/);
    expect(new URL(start.headers.get('location')!).searchParams.get('redirect_uri')).toBe('https://relationshipper.example/api/auth/google/callback');
  });

  it('reports configuration, and redirects when Google isn’t set up', async () => {
    expect((await new TestClient(t.env, t.ctx).get('/api/auth/config')).body).toEqual({ google: true, dev: true });
    const bare = await createTestEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, DEV_LOGIN: undefined });
    try {
      const client = new TestClient(bare.env, bare.ctx);
      expect((await client.get('/api/auth/config')).body).toEqual({ google: false, dev: false });
      expect((await client.get('/api/auth/google')).headers.get('location')).toBe('/?auth_error=google_not_configured');
      expect((await client.get('/api/auth/dev?email=a@example.com')).status).toBe(404);
    } finally {
      await bare.dispose();
    }
  });
});

describe('dev sign-in', () => {
  it('only works on localhost with DEV_LOGIN enabled', async () => {
    const remote = new TestClient(t.env, t.ctx, 'https://relationshipper.example');
    expect((await remote.get('/api/auth/dev?email=a@example.com')).status).toBe(404);
    const local = new TestClient(t.env, t.ctx);
    expect((await local.get('/api/auth/dev?email=a@example.com&name=Ari')).status).toBe(302);
    expect((await local.get<MeResponse>('/api/me')).body.user.name).toBe('Ari');
  });
});

describe('sessions', () => {
  it('signs out', async () => {
    const { client } = await signUp(t.env, t.ctx, 'Casey');
    expect((await client.post('/api/auth/logout')).status).toBe(204);
    expect((await client.get('/api/me')).status).toBe(401);
  });

  it('marks admins by email', async () => {
    const { client } = await signUp(t.env, t.ctx, 'Admin', 'UTC', 'admin@example.com');
    expect((await client.get<MeResponse>('/api/me')).body.user.isAdmin).toBe(true);
  });

  it('only redirects back to same-site paths', () => {
    expect(safeReturnTo('/join/ABC')).toBe('/join/ABC');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/api/me', '', undefined]) expect(safeReturnTo(bad)).toBe('/');
  });

  it('blocks cross-site form posts and requires JSON bodies', async () => {
    const { client } = await signUp(t.env, t.ctx, 'Form');
    const form = await client.request('PATCH', '/api/me', 'name=x', { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' });
    expect(form.status).toBe(403);
    const plain = await client.request('PATCH', '/api/me', '{}', { 'content-type': 'text/plain' });
    expect(plain.status).toBe(415);
  });
});
