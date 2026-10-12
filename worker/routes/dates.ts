import { Hono } from 'hono';
import type { DateIdeaDTO, DateNightDTO, DatesResponse } from '../../shared/api';
import { DATE_LIMITS } from '../../shared/dates';
import { isDay } from '../../shared/journal';
import { addDays, timeToMinutes, zonedNow } from '../../shared/time';
import { toDateIdea, toDateNight, type DateIdeaRow, type DateNightRow } from '../dates';
import type { HonoEnv } from '../env';
import { ApiError, badRequest, readJson, str } from '../http';
import { calendarEvent } from '../ics';
import { randomId } from '../lib/crypto';
import { notifyDate } from '../notify';
import { requireCouple, type PairedContext } from '../session';

// Date nights (see shared/dates.ts). Plans are shared with both partners as soon as they're made.

const today = (couple: PairedContext['couple']) => zonedNow(couple.timezone).day;

/** A day to plan for: from the day you paired to two years ahead, in the couple's time zone. */
function checkDay(couple: PairedContext['couple'], value: unknown): string {
  if (typeof value !== 'string' || !isDay(value)) throw badRequest('Choose a day.');
  if (value < zonedNow(couple.timezone, new Date(couple.created_at)).day) throw badRequest('That’s before you paired.');
  if (value > addDays(today(couple), 730)) throw badRequest('That’s more than two years away.');
  return value;
}

function checkTime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (timeToMinutes(value) === null) throw badRequest('Time must look like 19:30.');
  return value as string;
}

/** Who's planning it: you, your partner, or null for both of you. */
function checkPlanner(auth: PairedContext, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value !== auth.user.id && value !== auth.partner.id) throw badRequest('Choose who’s planning it.');
  return value as string;
}

const notesOf = (body: Record<string, unknown>) => (body.notes === undefined || body.notes === null ? '' : str(body, 'notes', { min: 0, max: DATE_LIMITS.notesMax, label: 'Notes' }));

async function findDate(db: D1Database, coupleId: string, id: string): Promise<DateNightRow> {
  const row = await db.prepare('SELECT * FROM date_nights WHERE id = ? AND couple_id = ?').bind(id, coupleId).first<DateNightRow>();
  if (!row) throw new ApiError(404, 'unknown_date', 'That date night doesn’t exist.');
  return row;
}

export const dateRoutes = new Hono<HonoEnv>()
  .get('/', async (c) => {
    const { couple } = requireCouple(c);
    const day = today(couple);
    const [upcoming, past, ideas] = await c.env.DB.batch<DateNightRow | DateIdeaRow>([
      c.env.DB.prepare('SELECT * FROM date_nights WHERE couple_id = ? AND day >= ? ORDER BY day, start_time IS NOT NULL, start_time').bind(couple.id, day),
      c.env.DB.prepare('SELECT * FROM date_nights WHERE couple_id = ? AND day < ? ORDER BY day DESC, start_time DESC LIMIT 30').bind(couple.id, day),
      c.env.DB.prepare('SELECT * FROM date_ideas WHERE couple_id = ? ORDER BY created_at DESC').bind(couple.id),
    ]);
    return c.json<DatesResponse>({
      today: day,
      upcoming: (upcoming!.results as DateNightRow[]).map(toDateNight),
      past: (past!.results as DateNightRow[]).map(toDateNight),
      ideas: (ideas!.results as DateIdeaRow[]).map(toDateIdea),
    });
  })

  .post('/', async (c) => {
    const auth = requireCouple(c);
    const { user, partner, couple } = auth;
    const body = await readJson(c);
    const day = checkDay(couple, body.day);
    const time = checkTime(body.time);
    const title = str(body, 'title', { max: DATE_LIMITS.titleMax, label: 'What you’ll do' });
    const notes = notesOf(body);
    const planner = checkPlanner(auth, body.plannerId);
    let ideaId: string | null = null;
    if (typeof body.ideaId === 'string') {
      const idea = await c.env.DB.prepare('SELECT id FROM date_ideas WHERE id = ? AND couple_id = ?').bind(body.ideaId, couple.id).first();
      if (idea) ideaId = body.ideaId;
    }
    const now = Date.now();
    const id = randomId();
    // Planned for today: no need for a morning reminder about it.
    const remindedOn = day === today(couple) ? day : null;
    await c.env.DB.prepare(
      `INSERT INTO date_nights (id, couple_id, day, start_time, title, notes, idea_id, planner_id, created_by, reminded_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, couple.id, day, time, title, notes, ideaId, planner, user.id, remindedOn, now, now)
      .run();
    const row = await findDate(c.env.DB, couple.id, id);
    if (day >= today(couple)) {
      c.executionCtx.waitUntil(
        notifyDate(c.env, { from: user, partnerId: partner.id, coupleId: couple.id, kind: 'planned', date: row }).catch((err) => console.error('notify failed', err)),
      );
    }
    return c.json<DateNightDTO>(toDateNight(row), 201);
  })

  .patch('/:id', async (c) => {
    const auth = requireCouple(c);
    const { user, partner, couple } = auth;
    const before = await findDate(c.env.DB, couple.id, c.req.param('id'));
    const body = await readJson(c);
    const day = body.day === undefined ? before.day : checkDay(couple, body.day);
    const time = body.time === undefined ? before.start_time : checkTime(body.time);
    const title = body.title === undefined ? before.title : str(body, 'title', { max: DATE_LIMITS.titleMax, label: 'What you’ll do' });
    const notes = body.notes === undefined ? before.notes : notesOf(body);
    const planner = body.plannerId === undefined ? before.planner_id : checkPlanner(auth, body.plannerId);
    const moved = day !== before.day || time !== before.start_time;
    // A date moved to another day gets its own reminder (none if it's moved to today).
    const remindedOn = moved ? (day === today(couple) ? day : null) : before.reminded_on;
    await c.env.DB.prepare(
      'UPDATE date_nights SET day = ?, start_time = ?, title = ?, notes = ?, planner_id = ?, reminded_on = ?, updated_at = ? WHERE id = ?',
    )
      .bind(day, time, title, notes, planner, remindedOn, Date.now(), before.id)
      .run();
    const row = await findDate(c.env.DB, couple.id, before.id);
    if (moved && day >= today(couple)) {
      c.executionCtx.waitUntil(
        notifyDate(c.env, { from: user, partnerId: partner.id, coupleId: couple.id, kind: 'moved', date: row }).catch((err) => console.error('notify failed', err)),
      );
    }
    return c.json<DateNightDTO>(toDateNight(row));
  })

  .delete('/:id', async (c) => {
    const { user, partner, couple } = requireCouple(c);
    const row = await findDate(c.env.DB, couple.id, c.req.param('id'));
    await c.env.DB.prepare('DELETE FROM date_nights WHERE id = ?').bind(row.id).run();
    if (row.day >= today(couple)) {
      c.executionCtx.waitUntil(
        notifyDate(c.env, { from: user, partnerId: partner.id, coupleId: couple.id, kind: 'cancelled', date: row }).catch((err) => console.error('notify failed', err)),
      );
    }
    return c.body(null, 204);
  })

  // Add to calendar: a one-event .ics file.
  .get('/:id/calendar.ics', async (c) => {
    const { couple } = requireCouple(c);
    const row = await findDate(c.env.DB, couple.id, c.req.param('id'));
    const origin = new URL(c.req.url).origin;
    c.header('Content-Type', 'text/calendar; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="date-night-${row.day}.ics"`);
    return c.body(
      calendarEvent({
        uid: `${row.id}@${new URL(origin).host}`,
        day: row.day,
        time: row.start_time,
        timeZone: couple.timezone,
        title: row.title,
        notes: row.notes,
        url: `${origin}/dates`,
      }),
    );
  });

export const dateIdeaRoutes = new Hono<HonoEnv>()
  .post('/', async (c) => {
    const { user, couple } = requireCouple(c);
    const body = await readJson(c);
    const title = str(body, 'title', { max: DATE_LIMITS.titleMax, label: 'The idea' });
    const notes = notesOf(body);
    if (body.setting !== undefined && body.setting !== null && body.setting !== 'home' && body.setting !== 'out') throw badRequest('Unknown setting.');
    const now = Date.now();
    const id = randomId();
    await c.env.DB.prepare('INSERT INTO date_ideas (id, couple_id, title, notes, setting, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, couple.id, title, notes, body.setting ?? null, user.id, now, now)
      .run();
    const row = (await c.env.DB.prepare('SELECT * FROM date_ideas WHERE id = ?').bind(id).first<DateIdeaRow>())!;
    return c.json<DateIdeaDTO>(toDateIdea(row), 201);
  })

  .patch('/:id', async (c) => {
    const { couple } = requireCouple(c);
    const before = await c.env.DB.prepare('SELECT * FROM date_ideas WHERE id = ? AND couple_id = ?').bind(c.req.param('id'), couple.id).first<DateIdeaRow>();
    if (!before) throw new ApiError(404, 'unknown_idea', 'That idea doesn’t exist.');
    const body = await readJson(c);
    const title = body.title === undefined ? before.title : str(body, 'title', { max: DATE_LIMITS.titleMax, label: 'The idea' });
    const notes = body.notes === undefined ? before.notes : notesOf(body);
    if (body.setting !== undefined && body.setting !== null && body.setting !== 'home' && body.setting !== 'out') throw badRequest('Unknown setting.');
    const setting = body.setting === undefined ? before.setting : (body.setting as DateIdeaRow['setting']);
    await c.env.DB.prepare('UPDATE date_ideas SET title = ?, notes = ?, setting = ?, updated_at = ? WHERE id = ?').bind(title, notes, setting, Date.now(), before.id).run();
    const row = (await c.env.DB.prepare('SELECT * FROM date_ideas WHERE id = ?').bind(before.id).first<DateIdeaRow>())!;
    return c.json<DateIdeaDTO>(toDateIdea(row));
  })

  .delete('/:id', async (c) => {
    const { couple } = requireCouple(c);
    const res = await c.env.DB.prepare('DELETE FROM date_ideas WHERE id = ? AND couple_id = ?').bind(c.req.param('id'), couple.id).run();
    if (!res.meta.changes) throw new ApiError(404, 'unknown_idea', 'That idea doesn’t exist.');
    return c.body(null, 204);
  });
