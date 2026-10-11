import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { LIMITS, type AuthConfigResponse } from '../../shared/api';
import { isValidTimeZone } from '../../shared/time';
import { exchangeCode, googleAuthUrl, verifyIdToken } from '../auth/google';
import type { AppEnv, HonoEnv } from '../env';
import { base64url, fromBase64url } from '../lib/encoding';
import { randomId, randomToken, sha256Bytes } from '../lib/crypto';
import { cookieName, endSession, startSession } from '../session';

const OAUTH_COOKIE = 'rs_oauth';
const CALLBACK_PATH = '/api/auth/google/callback';

interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  tz: string;
}

const googleConfigured = (env: AppEnv) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** Test sign-in, only for local development: needs DEV_LOGIN=true *and* a localhost request. */
function devLoginAllowed(c: Context<HonoEnv>): boolean {
  const host = new URL(c.req.url).hostname;
  return c.env.DEV_LOGIN === 'true' && (host === 'localhost' || host === '127.0.0.1');
}

/** Only same-site paths, never protocol-relative URLs or API routes. */
export function safeReturnTo(value: string | undefined): string {
  if (!value || value.length > 200 || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value.startsWith('/api/')) return '/';
  return value;
}

const failed = (c: Context<HonoEnv>, code: string) => c.redirect(`/?auth_error=${code}`, 302);

/** Finds or creates the user behind a sign-in identity. Returns the user id. */
export async function signInIdentity(
  env: AppEnv,
  identity: { provider: string; subject: string; email: string; name: string; timezone: string },
): Promise<string> {
  const db = env.DB;
  const email = identity.email.trim().toLowerCase();
  const existing = await db
    .prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?')
    .bind(identity.provider, identity.subject)
    .first<{ user_id: string }>();
  if (existing) {
    // Keep the email current (it's what admin access is checked against); never overwrite the chosen name.
    await db.batch([
      db.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, existing.user_id),
      db.prepare('UPDATE identities SET email = ? WHERE provider = ? AND subject = ?').bind(email, identity.provider, identity.subject),
    ]);
    return existing.user_id;
  }
  const id = randomId();
  const now = Date.now();
  const name = identity.name.trim().slice(0, LIMITS.nameMax) || email.split('@')[0]!.slice(0, LIMITS.nameMax);
  await db.batch([
    db.prepare('INSERT INTO users (id, email, name, timezone, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      id,
      email,
      name,
      isValidTimeZone(identity.timezone) ? identity.timezone : 'UTC',
      now,
      now,
    ),
    db.prepare('INSERT INTO identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)').bind(
      identity.provider,
      identity.subject,
      id,
      email,
      now,
    ),
  ]);
  return id;
}

export const authRoutes = new Hono<HonoEnv>()
  .get('/config', (c) => c.json<AuthConfigResponse>({ google: googleConfigured(c.env), dev: devLoginAllowed(c) }))

  // Step 1: send the browser to Google.
  .get('/google', async (c) => {
    if (!googleConfigured(c.env)) return failed(c, 'google_not_configured');
    const flow: OAuthState = {
      state: randomToken(),
      nonce: randomToken(),
      verifier: randomToken(48),
      returnTo: safeReturnTo(c.req.query('returnTo')),
      tz: c.req.query('tz') ?? 'UTC',
    };
    const secure = new URL(c.req.url).protocol === 'https:';
    setCookie(c, cookieName(c, OAUTH_COOKIE), base64url(new TextEncoder().encode(JSON.stringify(flow))), {
      path: '/',
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      maxAge: 600,
    });
    return c.redirect(
      googleAuthUrl({
        clientId: c.env.GOOGLE_CLIENT_ID!,
        redirectUri: new URL(CALLBACK_PATH, c.req.url).toString(),
        state: flow.state,
        nonce: flow.nonce,
        codeChallenge: base64url(await sha256Bytes(flow.verifier)),
      }),
      302,
    );
  })

  // Step 2: Google sends the browser back with a code.
  .get('/google/callback', async (c) => {
    const raw = getCookie(c, cookieName(c, OAUTH_COOKIE));
    deleteCookie(c, cookieName(c, OAUTH_COOKIE), { path: '/', secure: new URL(c.req.url).protocol === 'https:' });
    if (!googleConfigured(c.env)) return failed(c, 'google_not_configured');
    if (c.req.query('error')) return failed(c, 'cancelled');
    let flow: OAuthState;
    try {
      flow = JSON.parse(new TextDecoder().decode(fromBase64url(raw ?? ''))) as OAuthState;
    } catch {
      return failed(c, 'expired');
    }
    const code = c.req.query('code');
    if (!flow?.state || c.req.query('state') !== flow.state || !code) return failed(c, 'expired');

    try {
      const idToken = await exchangeCode({
        clientId: c.env.GOOGLE_CLIENT_ID!,
        clientSecret: c.env.GOOGLE_CLIENT_SECRET!,
        code,
        codeVerifier: flow.verifier,
        redirectUri: new URL(CALLBACK_PATH, c.req.url).toString(),
      });
      const claims = await verifyIdToken(idToken, { clientId: c.env.GOOGLE_CLIENT_ID!, nonce: flow.nonce });
      const userId = await signInIdentity(c.env, {
        provider: 'google',
        subject: claims.sub,
        email: claims.email,
        name: claims.given_name || claims.name || '',
        timezone: flow.tz,
      });
      await startSession(c, userId);
      return c.redirect(safeReturnTo(flow.returnTo), 302);
    } catch (err) {
      console.error('Google sign-in failed', err);
      return failed(c, 'failed');
    }
  })

  // Local development and end-to-end tests only.
  .get('/dev', async (c) => {
    if (!devLoginAllowed(c)) return c.notFound();
    const email = (c.req.query('email') ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return c.text('email required', 400);
    const userId = await signInIdentity(c.env, {
      provider: 'dev',
      subject: email,
      email,
      name: c.req.query('name') ?? '',
      timezone: c.req.query('tz') ?? 'UTC',
    });
    await startSession(c, userId);
    return c.redirect(safeReturnTo(c.req.query('returnTo')), 302);
  })

  .post('/logout', async (c) => {
    await endSession(c);
    return c.body(null, 204);
  });
