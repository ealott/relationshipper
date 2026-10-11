import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, HonoEnv } from './env';
import { ApiError } from './http';
import { randomBytes, sha256 } from './lib/crypto';
import { base64url } from './lib/encoding';

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL = 90 * DAY;

const isHttps = (c: Context) => new URL(c.req.url).protocol === 'https:';

/** Over HTTPS cookies get the `__Host-` prefix, so sibling subdomains can't set or overwrite them. */
export const cookieName = (c: Context, base: string) => (isHttps(c) ? `__Host-${base}` : base);

export interface UserRow {
  id: string;
  email: string;
  name: string;
  couple_id: string | null;
  timezone: string;
  reminder_enabled: number;
  reminder_minutes: number;
  notify_partner: number;
  last_reminded_on: string | null;
  last_activity_push_at: number | null;
  last_nudge_at: number | null;
  last_seen_at: number | null;
  created_at: number;
}

export interface CoupleRow {
  id: string;
  timezone: string;
  include_intimacy: number;
  married: number | null;
  living_together: number | null;
  has_kids: number | null;
  created_at: number;
}

export interface AuthContext {
  sessionId: string;
  user: UserRow;
  isAdmin: boolean;
  partner: { id: string; name: string } | null;
  couple: CoupleRow | null;
}

export interface PairedContext extends AuthContext {
  partner: { id: string; name: string };
  couple: CoupleRow;
}

type ContextRow = UserRow & {
  c_id: string | null;
  c_timezone: string | null;
  c_include_intimacy: number | null;
  c_married: number | null;
  c_living_together: number | null;
  c_has_kids: number | null;
  c_created_at: number | null;
  p_id: string | null;
  p_name: string | null;
};

const CONTEXT_COLUMNS = `u.*,
  c.id AS c_id, c.timezone AS c_timezone, c.include_intimacy AS c_include_intimacy,
  c.married AS c_married, c.living_together AS c_living_together, c.has_kids AS c_has_kids, c.created_at AS c_created_at,
  p.id AS p_id, p.name AS p_name`;

export function isAdminEmail(env: AppEnv, email: string): boolean {
  const admins = (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}
const CONTEXT_JOINS = `LEFT JOIN couples c ON c.id = u.couple_id
  LEFT JOIN users p ON p.couple_id = u.couple_id AND p.id <> u.id`;

function toContext(env: AppEnv, row: ContextRow, sessionId: string): AuthContext {
  const { c_id, c_timezone, c_include_intimacy, c_married, c_living_together, c_has_kids, c_created_at, p_id, p_name, ...user } = row;
  // A couple always has two members; treat a half-formed one as unpaired.
  const paired = c_id !== null && p_id !== null;
  return {
    sessionId,
    user,
    isAdmin: isAdminEmail(env, user.email),
    partner: paired ? { id: p_id, name: p_name! } : null,
    couple: paired
      ? {
          id: c_id,
          timezone: c_timezone!,
          include_intimacy: c_include_intimacy!,
          married: c_married,
          living_together: c_living_together,
          has_kids: c_has_kids,
          created_at: c_created_at!,
        }
      : null,
  };
}

export async function loadAuth(env: AppEnv, sessionId: string, now = Date.now()) {
  const row = await env.DB.prepare(
    `SELECT ${CONTEXT_COLUMNS}, s.expires_at AS session_expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id ${CONTEXT_JOINS}
      WHERE s.id = ?1 AND s.expires_at > ?2`,
  )
    .bind(sessionId, now)
    .first<ContextRow & { session_expires_at: number }>();
  if (!row) return null;
  const { session_expires_at, ...rest } = row;
  return { auth: toContext(env, rest, sessionId), expiresAt: session_expires_at };
}

/** Fresh context for a user (after a change), keeping the current session id. */
export async function reloadAuth(env: AppEnv, userId: string, sessionId = ''): Promise<AuthContext> {
  const row = await env.DB.prepare(`SELECT ${CONTEXT_COLUMNS} FROM users u ${CONTEXT_JOINS} WHERE u.id = ?`)
    .bind(userId)
    .first<ContextRow>();
  if (!row) throw new ApiError(401, 'unauthenticated', 'Please sign in.');
  return toContext(env, row, sessionId);
}

function cookieOptions(c: Context) {
  return {
    path: '/',
    httpOnly: true,
    secure: isHttps(c),
    sameSite: 'Lax' as const,
    maxAge: SESSION_TTL / 1000,
  };
}

/** Creates a session and sets the cookie. Returns the session id. */
export async function startSession(c: Context<HonoEnv>, userId: string): Promise<string> {
  const token = base64url(randomBytes(32));
  const id = await sha256(token);
  const now = Date.now();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(id, userId, now, now + SESSION_TTL)
    .run();
  setCookie(c, cookieName(c, 'rs_session'), token, cookieOptions(c));
  return id;
}

export function clearSessionCookie(c: Context<HonoEnv>) {
  deleteCookie(c, cookieName(c, 'rs_session'), { path: '/', secure: isHttps(c) });
}

export async function endSession(c: Context<HonoEnv>): Promise<void> {
  const token = getCookie(c, cookieName(c, 'rs_session'));
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
  clearSessionCookie(c);
}

/** Loads the signed-in user (if any) into `c.var.auth`, sliding the session expiry about once a day. */
export const sessionMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  c.set('auth', null);
  const token = getCookie(c, cookieName(c, 'rs_session'));
  if (token && token.length <= 128) {
    const now = Date.now();
    const loaded = await loadAuth(c.env, await sha256(token), now);
    if (loaded) {
      c.set('auth', loaded.auth);
      // Slide the session (and record activity) about once a day.
      if (loaded.expiresAt - now < SESSION_TTL - DAY) {
        await c.env.DB.batch([
          c.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').bind(now + SESSION_TTL, loaded.auth.sessionId),
          c.env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, loaded.auth.user.id),
        ]);
        setCookie(c, cookieName(c, 'rs_session'), token, cookieOptions(c));
      }
    }
  }
  await next();
};

export function requireAuth(c: Context<HonoEnv>): AuthContext {
  const auth = c.get('auth');
  if (!auth) throw new ApiError(401, 'unauthenticated', 'Please sign in.');
  return auth;
}

export function requireAdmin(c: Context<HonoEnv>): AuthContext {
  const auth = requireAuth(c);
  if (!auth.isAdmin) throw new ApiError(403, 'forbidden', 'Admins only.');
  return auth;
}

export function requireCouple(c: Context<HonoEnv>): PairedContext {
  const auth = requireAuth(c);
  if (!auth.couple || !auth.partner) throw new ApiError(409, 'not_paired', 'Pair with your partner first.');
  return auth as PairedContext;
}
