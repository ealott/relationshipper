import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { LIMITS, type AuthConfigResponse, type MeResponse } from '../../shared/api';
import { isValidTimeZone } from '../../shared/time';
import { exchangeCode, googleAuthUrl, verifyIdToken } from '../auth/google';
import { toMeResponse } from '../dto';
import { loginUsers } from '../loginUsers';
import type { AppEnv, HonoEnv } from '../env';
import { ApiError, readJson, str } from '../http';
import { base64url, fromBase64url } from '../lib/encoding';
import { randomId, randomToken, sha256Bytes } from '../lib/crypto';
import { clientIp, rateLimit } from '../rateLimit';
import { cookieName, endSession, reloadAuth, startSession } from '../session';

const OAUTH_COOKIE = 'rs_oauth';
const CALLBACK_PATH = '/api/auth/google/callback';

interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  tz: string;
}

const MINUTE = 60 * 1000;

const googleConfigured = (env: AppEnv) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const passwordConfigured = (env: AppEnv) => Boolean(env.LOGIN_PASSWORD) && loginUsers(env).length > 0;

/** Compares two secrets in constant time (by comparing their hashes). */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256Bytes(a), sha256Bytes(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

/**
 * Creates the configured accounts on first sign-in and, when there are exactly two, pairs
 * them, so the couple never needs an invite code. Returns the id of the person signing in.
 */
async function ensurePasswordAccounts(env: AppEnv, names: string[], who: string, timezone: string): Promise<string> {
  const ids = new Map<string, string>();
  for (const name of names) {
    const login = name.toLowerCase();
    ids.set(name, await signInIdentity(env, { provider: 'password', subject: login, email: login, name, timezone }));
  }
  if (names.length === 2) {
    const db = env.DB;
    const [a, b] = names.map((n) => ids.get(n)!);
    const { results } = await db.prepare('SELECT couple_id FROM users WHERE id IN (?, ?)').bind(a, b).all<{ couple_id: string | null }>();
    if (results.length === 2 && results.every((u) => u.couple_id === null)) {
      const coupleId = randomId();
      await db.batch([
        db.prepare('INSERT INTO couples (id, timezone, include_intimacy, created_at) VALUES (?, ?, 0, ?)').bind(
          coupleId,
          isValidTimeZone(timezone) ? timezone : 'UTC',
          Date.now(),
        ),
        db.prepare('UPDATE users SET couple_id = ? WHERE id IN (?, ?) AND couple_id IS NULL').bind(coupleId, a, b),
      ]);
      // If a simultaneous sign-in paired them first, drop the empty couple.
      const members = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE couple_id = ?').bind(coupleId).first<{ n: number }>();
      if (members?.n !== 2) {
        await db.batch([
          db.prepare('UPDATE users SET couple_id = NULL WHERE couple_id = ?').bind(coupleId),
          db.prepare('DELETE FROM couples WHERE id = ?').bind(coupleId),
        ]);
      }
    }
  }
  return ids.get(who)!;
}

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
  .get('/config', (c) =>
    c.json<AuthConfigResponse>({ google: googleConfigured(c.env), password: passwordConfigured(c.env), dev: devLoginAllowed(c) }),
  )

  // Simple sign-in with a name and the shared password.
  .post('/password', async (c) => {
    if (!passwordConfigured(c.env)) return c.notFound();
    const body = await readJson(c);
    const name = str(body, 'name', { max: 60, label: 'Name' });
    const password = str(body, 'password', { max: 200, label: 'Password', trim: false });
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    // Slow down guessing: per device, and across everyone (sessions last 90 days, so real
    // sign-ins are rare).
    await rateLimit(c.env.DB, `login:${clientIp(c.req.raw)}`, 10, 15 * MINUTE);
    await rateLimit(c.env.DB, 'login:all', 60, 60 * MINUTE);
    const names = loginUsers(c.env);
    const who = names.find((n) => n.toLowerCase() === name.toLowerCase());
    const passwordOk = await sameSecret(password, c.env.LOGIN_PASSWORD!);
    if (!who || !passwordOk) throw new ApiError(401, 'wrong_password', 'That name and password don’t match.');
    const userId = await ensurePasswordAccounts(c.env, names, who, timezone);
    const sessionId = await startSession(c, userId);
    return c.json<MeResponse>(toMeResponse(await reloadAuth(c.env, userId, sessionId), c.env));
  })

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
