import { Hono } from 'hono';
import type { InvitePreviewResponse, InviteResponse } from '../../shared/api';
import { isValidTimeZone } from '../../shared/time';
import { toMeResponse } from '../dto';
import type { HonoEnv } from '../env';
import { ApiError, badRequest, optionalBool, readJson, str } from '../http';
import { randomId, randomString } from '../lib/crypto';
import { isPermanentPair } from '../loginUsers';
import { clientIp, rateLimit } from '../rateLimit';
import { reloadAuth, requireAuth, requireCouple } from '../session';

const MINUTE = 60 * 1000;
const INVITE_TTL = 7 * 24 * 60 * MINUTE;
// No 0/O, 1/I/L: easy to read aloud and type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Removes a couple and everything they shared. Both partners become unpaired. */
export function deleteCoupleStatements(db: D1Database, coupleId: string): D1PreparedStatement[] {
  return [
    // Before the partners are unpaired, while their feeds can still be found by couple.
    db.prepare('DELETE FROM calendar_feeds WHERE user_id IN (SELECT id FROM users WHERE couple_id = ?)').bind(coupleId),
    db.prepare('UPDATE users SET couple_id = NULL, last_reminded_on = NULL WHERE couple_id = ?').bind(coupleId),
    db.prepare('DELETE FROM answer_versions WHERE couple_id = ?').bind(coupleId),
    db.prepare('DELETE FROM response_versions WHERE response_id IN (SELECT id FROM responses WHERE couple_id = ?)').bind(coupleId),
    db.prepare('DELETE FROM answers WHERE couple_id = ?').bind(coupleId),
    db.prepare('DELETE FROM responses WHERE couple_id = ?').bind(coupleId),
    db.prepare('DELETE FROM daily_questions WHERE couple_id = ?').bind(coupleId),
    db.prepare('DELETE FROM drafts WHERE couple_id = ?').bind(coupleId),
    db.prepare('DELETE FROM snuggles WHERE couple_id = ?').bind(coupleId),
    db.prepare('DELETE FROM date_nights WHERE couple_id = ?').bind(coupleId),
    db.prepare('DELETE FROM date_ideas WHERE couple_id = ?').bind(coupleId),
    db.prepare('DELETE FROM milestone_memories WHERE milestone_id IN (SELECT id FROM milestones WHERE couple_id = ?)').bind(coupleId),
    db.prepare('DELETE FROM milestones WHERE couple_id = ?').bind(coupleId),
    db.prepare('DELETE FROM questions WHERE couple_id = ?').bind(coupleId),
    db.prepare('DELETE FROM couples WHERE id = ?').bind(coupleId),
  ];
}

/** Deletes a person, their sign-in identities and devices, and their couple's shared data. */
export function deleteUserStatements(db: D1Database, userId: string, coupleId: string | null): D1PreparedStatement[] {
  return [
    ...(coupleId ? deleteCoupleStatements(db, coupleId) : []),
    db.prepare('DELETE FROM drafts WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM identities WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM invites WHERE user_id = ?').bind(userId),
    db.prepare('UPDATE question_suggestions SET author_id = NULL WHERE author_id = ?').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ];
}

export const pairingRoutes = new Hono<HonoEnv>()
  .post('/invite', async (c) => {
    const { user, couple } = requireAuth(c);
    if (couple) throw new ApiError(409, 'already_paired', 'You’re already paired.');
    const db = c.env.DB;
    const now = Date.now();
    const existing = await db.prepare('SELECT code, expires_at FROM invites WHERE user_id = ? AND expires_at > ?')
      .bind(user.id, now)
      .first<{ code: string; expires_at: number }>();
    if (existing) return c.json<InviteResponse>({ code: existing.code, expiresAt: existing.expires_at });

    await db.prepare('DELETE FROM invites WHERE user_id = ?').bind(user.id).run();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomString(CODE_ALPHABET, CODE_LENGTH);
      try {
        await db.prepare('INSERT INTO invites (code, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
          .bind(code, user.id, now, now + INVITE_TTL)
          .run();
        return c.json<InviteResponse>({ code, expiresAt: now + INVITE_TTL });
      } catch (err) {
        if (!String(err).includes('UNIQUE')) throw err;
      }
    }
    throw new Error('Could not allocate an invite code');
  })
  .get('/invite/:code', async (c) => {
    await rateLimit(c.env.DB, `invite-preview:${clientIp(c.req.raw)}`, 60, 15 * MINUTE);
    const row = await c.env.DB.prepare(
      `SELECT u.name FROM invites i JOIN users u ON u.id = i.user_id
        WHERE i.code = ? AND i.expires_at > ? AND u.couple_id IS NULL`,
    )
      .bind(normalizeCode(c.req.param('code')), Date.now())
      .first<{ name: string }>();
    if (!row) throw new ApiError(404, 'invalid_code', 'This invite has expired or was already used.');
    return c.json<InvitePreviewResponse>({ inviterName: row.name });
  })
  .post('/pair', async (c) => {
    const { user, couple, sessionId } = requireAuth(c);
    if (couple) throw new ApiError(409, 'already_paired', 'You’re already paired.');
    const body = await readJson(c);
    const code = normalizeCode(str(body, 'code', { max: 20, label: 'Invite code' }));
    const db = c.env.DB;
    await rateLimit(db, `pair:${user.id}`, 20, 15 * MINUTE);

    const now = Date.now();
    const inviter = await db
      .prepare(
        `SELECT u.id, u.timezone, u.couple_id FROM invites i JOIN users u ON u.id = i.user_id
          WHERE i.code = ? AND i.expires_at > ?`,
      )
      .bind(code, now)
      .first<{ id: string; timezone: string; couple_id: string | null }>();
    if (!inviter) throw new ApiError(404, 'invalid_code', 'That code doesn’t work. Double-check it, or ask for a new one.');
    if (inviter.id === user.id) throw badRequest('That’s your own code — send it to your partner instead.', 'own_code');
    if (inviter.couple_id) throw new ApiError(409, 'inviter_paired', 'That person is already paired with someone.');

    const coupleId = randomId();
    await db.batch([
      db.prepare('INSERT INTO couples (id, timezone, include_intimacy, created_at) VALUES (?, ?, 0, ?)').bind(
        coupleId,
        inviter.timezone,
        now,
      ),
      db.prepare('UPDATE users SET couple_id = ? WHERE id IN (?, ?) AND couple_id IS NULL').bind(coupleId, inviter.id, user.id),
      db.prepare('DELETE FROM invites WHERE user_id IN (?, ?)').bind(inviter.id, user.id),
    ]);
    // Guard against a race with another pairing for either person.
    const members = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE couple_id = ?').bind(coupleId).first<{ n: number }>();
    if (members?.n !== 2) {
      await db.batch(deleteCoupleStatements(db, coupleId));
      throw new ApiError(409, 'pairing_conflict', 'Pairing didn’t go through. Please try again.');
    }
    return c.json(toMeResponse(await reloadAuth(c.env, user.id, sessionId), c.env));
  })
  .patch('/couple', async (c) => {
    const { user, couple, sessionId } = requireCouple(c);
    const body = await readJson(c);
    const sets: string[] = [];
    const values: unknown[] = [];
    if (body.timezone !== undefined) {
      if (!isValidTimeZone(body.timezone)) throw badRequest('Unknown timezone.');
      sets.push('timezone = ?');
      values.push(body.timezone);
    }
    // Booleans for the couple's settings and stage.
    for (const [key, column] of [
      ['includeIntimacy', 'include_intimacy'],
      ['married', 'married'],
      ['livingTogether', 'living_together'],
      ['hasKids', 'has_kids'],
    ] as const) {
      const v = optionalBool(body, key);
      if (v !== undefined) {
        sets.push(`${column} = ?`);
        values.push(v ? 1 : 0);
      }
    }
    if (sets.length) {
      await c.env.DB.prepare(`UPDATE couples SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...values, couple.id)
        .run();
    }
    return c.json(toMeResponse(await reloadAuth(c.env, user.id, sessionId), c.env));
  })
  .post('/couple/unpair', async (c) => {
    const { user, partner, couple, sessionId } = requireCouple(c);
    if (isPermanentPair(c.env, [user.email, partner.email])) {
      throw new ApiError(409, 'permanent_couple', 'You two are paired for good on this server.');
    }
    await c.env.DB.batch(deleteCoupleStatements(c.env.DB, couple.id));
    return c.json(toMeResponse(await reloadAuth(c.env, user.id, sessionId), c.env));
  });
