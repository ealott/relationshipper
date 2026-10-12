import { Hono } from 'hono';
import type { SnugglesResponse } from '../../shared/api';
import type { HonoEnv } from '../env';
import { ApiError } from '../http';
import { randomId } from '../lib/crypto';
import { notifySnuggle } from '../notify';
import { requireCouple } from '../session';

/** One notification per sender in this window; snuggles in between are still kept. */
export const SNUGGLE_PUSH_GAP_MS = 5 * 60 * 1000;
/** A double tap isn't two snuggles. */
const SNUGGLE_MIN_GAP_MS = 3000;

export const snuggleRoutes = new Hono<HonoEnv>()
  .get('/', async (c) => {
    const { user, partner, couple } = requireCouple(c);
    const row = await c.env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM snuggles WHERE couple_id = ?1 AND from_user = ?2 AND seen_at IS NULL) AS unseen,
              (SELECT MAX(created_at) FROM snuggles WHERE couple_id = ?1 AND from_user = ?2) AS received,
              (SELECT MAX(created_at) FROM snuggles WHERE couple_id = ?1 AND from_user = ?3) AS sent`,
    )
      .bind(couple.id, partner.id, user.id)
      .first<{ unseen: number; received: number | null; sent: number | null }>();
    return c.json<SnugglesResponse>({ unseen: row?.unseen ?? 0, lastReceivedAt: row?.received ?? null, lastSentAt: row?.sent ?? null });
  })

  .post('/', async (c) => {
    const { user, partner, couple } = requireCouple(c);
    const db = c.env.DB;
    const now = Date.now();
    const last = await db
      .prepare('SELECT MAX(created_at) AS at FROM snuggles WHERE couple_id = ? AND from_user = ?')
      .bind(couple.id, user.id)
      .first<{ at: number | null }>();
    if (last?.at && now - last.at < SNUGGLE_MIN_GAP_MS) throw new ApiError(429, 'too_fast', 'Snuggle sent.');
    await db.batch([
      db.prepare('INSERT INTO snuggles (id, couple_id, from_user, created_at) VALUES (?, ?, ?, ?)').bind(randomId(), couple.id, user.id, now),
      // Snuggling back means you've seen theirs.
      db.prepare('UPDATE snuggles SET seen_at = ? WHERE couple_id = ? AND from_user = ? AND seen_at IS NULL').bind(now, couple.id, partner.id),
    ]);
    if (!last?.at || now - last.at >= SNUGGLE_PUSH_GAP_MS) {
      c.executionCtx.waitUntil(notifySnuggle(c.env, { from: user, partnerId: partner.id, coupleId: couple.id }).catch((err) => console.error('notify failed', err)));
    }
    return c.body(null, 204);
  })

  .post('/seen', async (c) => {
    const { partner, couple } = requireCouple(c);
    await c.env.DB.prepare('UPDATE snuggles SET seen_at = ? WHERE couple_id = ? AND from_user = ? AND seen_at IS NULL').bind(Date.now(), couple.id, partner.id).run();
    return c.body(null, 204);
  });
