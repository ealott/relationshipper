import { Hono, type Context } from 'hono';
import type { MilestoneDTO, TimelineResponse } from '../../shared/api';
import { zonedNow } from '../../shared/time';
import { firstDayOf, isMilestoneDay, isMilestoneKind, latestMilestoneDay, TIMELINE_LIMITS, type MilestoneKind } from '../../shared/timeline';
import type { HonoEnv } from '../env';
import { badRequest, readJson, str } from '../http';
import { randomId } from '../lib/crypto';
import { notifyTimeline } from '../notify';
import { requireCouple, type PairedContext } from '../session';
import { findMilestone, loadMilestones } from '../timeline';

// Our timeline (see shared/timeline.ts). Milestones and memories are shared as soon as they're
// written; either partner can change or remove a milestone, and each writes only their own memory.

/** Filling in a timeline means adding several things at once: one notification per sitting. */
export const TIMELINE_SITTING_MS = 10 * 60 * 1000;

const today = (couple: PairedContext['couple']) => zonedNow(couple.timezone).day;

function checkDay(couple: PairedContext['couple'], value: unknown): string {
  if (!isMilestoneDay(value)) throw badRequest('Choose a year, a month or a day.');
  if (firstDayOf(value) > latestMilestoneDay(today(couple))) throw badRequest('That’s more than ten years away.');
  return value;
}

function checkKind(value: unknown): MilestoneKind {
  if (!isMilestoneKind(value)) throw badRequest('Choose what kind of milestone it is.');
  return value;
}

/** An optional text field: missing or null is empty. */
const optional = (body: Record<string, unknown>, key: string, max: number, label: string) =>
  body[key] === undefined || body[key] === null ? '' : str(body, key, { min: 0, max, label });

function checkSongUrl(value: string): string {
  if (!value) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw badRequest('The song link must be a web address.');
  }
  if (url.protocol !== 'https:') throw badRequest('The song link must start with https://.');
  return url.href;
}

/** When this partner last added to the timeline: a milestone, or their memory of one. */
async function lastAddedAt(db: D1Database, coupleId: string, userId: string): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT MAX(at) AS at FROM (
         SELECT MAX(created_at) AS at FROM milestones WHERE couple_id = ?1 AND created_by = ?2
         UNION ALL
         SELECT MAX(mm.updated_at) FROM milestone_memories mm JOIN milestones m ON m.id = mm.milestone_id
          WHERE m.couple_id = ?1 AND mm.user_id = ?2
       )`,
    )
    .bind(coupleId, userId)
    .first<{ at: number | null }>();
  return row?.at ?? null;
}

function notify(c: Context<HonoEnv>, kind: 'added' | 'memory', milestoneId: string) {
  const { user, partner, couple } = requireCouple(c);
  c.executionCtx.waitUntil(
    notifyTimeline(c.env, { from: user, partnerId: partner.id, coupleId: couple.id, kind, milestoneId }).catch((err) => console.error('notify failed', err)),
  );
}

export const timelineRoutes = new Hono<HonoEnv>()
  .get('/', async (c) => {
    const { couple } = requireCouple(c);
    return c.json<TimelineResponse>({ today: today(couple), milestones: await loadMilestones(c.env.DB, couple.id) });
  })

  .get('/:id', async (c) => {
    const { couple } = requireCouple(c);
    return c.json<MilestoneDTO>(await findMilestone(c.env.DB, couple.id, c.req.param('id')));
  })

  .post('/', async (c) => {
    const { user, couple } = requireCouple(c);
    const db = c.env.DB;
    const body = await readJson(c);
    const kind = checkKind(body.kind);
    const title = str(body, 'title', { max: TIMELINE_LIMITS.titleMax, label: 'Title' });
    const day = checkDay(couple, body.day);
    const place = optional(body, 'place', TIMELINE_LIMITS.placeMax, 'Place');
    const last = await lastAddedAt(db, couple.id, user.id);
    const now = Date.now();
    const id = randomId();
    await db
      .prepare('INSERT INTO milestones (id, couple_id, kind, title, day, place, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, couple.id, kind, title, day, place, user.id, now, now)
      .run();
    if (!last || now - last >= TIMELINE_SITTING_MS) notify(c, 'added', id);
    return c.json<MilestoneDTO>(await findMilestone(db, couple.id, id), 201);
  })

  .patch('/:id', async (c) => {
    const { couple } = requireCouple(c);
    const db = c.env.DB;
    const before = await findMilestone(db, couple.id, c.req.param('id'));
    const body = await readJson(c);
    const kind = body.kind === undefined ? before.kind : checkKind(body.kind);
    const title = body.title === undefined ? before.title : str(body, 'title', { max: TIMELINE_LIMITS.titleMax, label: 'Title' });
    const day = body.day === undefined ? before.day : checkDay(couple, body.day);
    const place = body.place === undefined ? before.place : optional(body, 'place', TIMELINE_LIMITS.placeMax, 'Place');
    await db
      .prepare('UPDATE milestones SET kind = ?, title = ?, day = ?, place = ?, updated_at = ? WHERE id = ?')
      .bind(kind, title, day, place, Date.now(), before.id)
      .run();
    return c.json<MilestoneDTO>(await findMilestone(db, couple.id, before.id));
  })

  // Removes it for both of you, with both memories.
  .delete('/:id', async (c) => {
    const { couple } = requireCouple(c);
    const db = c.env.DB;
    const milestone = await findMilestone(db, couple.id, c.req.param('id'));
    await db.batch([
      db.prepare('DELETE FROM milestone_memories WHERE milestone_id = ?').bind(milestone.id),
      db.prepare('DELETE FROM milestones WHERE id = ?').bind(milestone.id),
    ]);
    return c.body(null, 204);
  })

  // Your own memory of it. Sending it all empty removes it.
  .put('/:id/memory', async (c) => {
    const { user, couple } = requireCouple(c);
    const db = c.env.DB;
    const milestone = await findMilestone(db, couple.id, c.req.param('id'));
    const body = await readJson(c);
    const text = optional(body, 'text', TIMELINE_LIMITS.memoryMax, 'Your memory');
    const songTitle = optional(body, 'songTitle', TIMELINE_LIMITS.songMax, 'Song');
    const songArtist = optional(body, 'songArtist', TIMELINE_LIMITS.songMax, 'Artist');
    const songUrl = checkSongUrl(optional(body, 'songUrl', TIMELINE_LIMITS.songUrlMax, 'Song link'));
    if (!text && !songTitle && !songArtist && !songUrl) {
      await db.prepare('DELETE FROM milestone_memories WHERE milestone_id = ? AND user_id = ?').bind(milestone.id, user.id).run();
      return c.json<MilestoneDTO>(await findMilestone(db, couple.id, milestone.id));
    }
    const first = !milestone.memories.some((m) => m.userId === user.id);
    const last = first ? await lastAddedAt(db, couple.id, user.id) : null;
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO milestone_memories (milestone_id, user_id, text, song_title, song_artist, song_url, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT (milestone_id, user_id) DO UPDATE SET
           text = excluded.text, song_title = excluded.song_title, song_artist = excluded.song_artist,
           song_url = excluded.song_url, updated_at = excluded.updated_at`,
      )
      .bind(milestone.id, user.id, text, songTitle, songArtist, songUrl, now)
      .run();
    // Edits are quiet; a new memory is news, unless it's part of a sitting that already was.
    if (first && (!last || now - last >= TIMELINE_SITTING_MS)) notify(c, 'memory', milestone.id);
    return c.json<MilestoneDTO>(await findMilestone(db, couple.id, milestone.id));
  });
