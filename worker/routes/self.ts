import { Hono } from 'hono';
import type { LifeChapterDTO, LifeNoteDTO, SelfProfileDTO, SelfResponse } from '../../shared/api';
import { isDay } from '../../shared/journal';
import { isChapterColor, isLifeDay, SELF_LIMITS, type ChapterColor } from '../../shared/self';
import { zonedNow } from '../../shared/time';
import type { HonoEnv } from '../env';
import { ApiError, badRequest, readJson, str } from '../http';
import { randomId } from '../lib/crypto';
import { requireAuth } from '../session';

// Self (see shared/self.ts). Private to each person: every query here is by the signed-in user's
// own id, so none of it reaches their partner, and admin endpoints never read these tables.

interface ChapterRow {
  id: string;
  title: string;
  start_day: string;
  end_day: string | null;
  color: ChapterColor;
}

const toChapter = (r: ChapterRow): LifeChapterDTO => ({ id: r.id, title: r.title, start: r.start_day, end: r.end_day, color: r.color });

function checkChapter(body: Record<string, unknown>) {
  const title = str(body, 'title', { max: SELF_LIMITS.chapterTitleMax, label: 'A name for the chapter' });
  if (!isLifeDay(body.start)) throw badRequest('Choose when the chapter started.');
  const end = body.end === null || body.end === undefined || body.end === '' ? null : body.end;
  if (end !== null && !isLifeDay(end)) throw badRequest('Choose when the chapter ended, or leave it going.');
  if (end !== null && end < body.start) throw badRequest('A chapter can’t end before it starts.');
  if (!isChapterColor(body.color)) throw badRequest('Choose a color.');
  return { title, start: body.start, end, color: body.color };
}

function checkNote(body: Record<string, unknown>) {
  if (!isLifeDay(body.day)) throw badRequest('Choose a day for the note.');
  return { day: body.day, text: str(body, 'text', { max: SELF_LIMITS.noteMax, label: 'The note' }) };
}

async function countOf(db: D1Database, table: 'life_chapters' | 'life_notes', userId: string): Promise<number> {
  return (await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).bind(userId).first<{ n: number }>())?.n ?? 0;
}

export const selfRoutes = new Hono<HonoEnv>()
  .get('/', async (c) => {
    const { user, couple } = requireAuth(c);
    const db = c.env.DB;
    const [profile, chapters, notes, milestones] = await db.batch([
      db.prepare('SELECT birthday, years FROM self_profiles WHERE user_id = ?').bind(user.id),
      db.prepare('SELECT id, title, start_day, end_day, color FROM life_chapters WHERE user_id = ? ORDER BY start_day, created_at').bind(user.id),
      db.prepare('SELECT id, day, text FROM life_notes WHERE user_id = ? ORDER BY day, created_at').bind(user.id),
      // Known to the day or the month; a year alone is too loose for a week.
      db.prepare('SELECT id, day, title FROM milestones WHERE couple_id = ? AND length(day) >= 7 ORDER BY day').bind(couple?.id ?? ''),
    ]);
    return c.json<SelfResponse>({
      today: zonedNow(user.timezone).day,
      profile: (profile!.results[0] as SelfProfileDTO | undefined) ?? null,
      chapters: (chapters!.results as unknown as ChapterRow[]).map(toChapter),
      notes: notes!.results as unknown as LifeNoteDTO[],
      milestones: milestones!.results as unknown as SelfResponse['milestones'],
    });
  })

  .put('/profile', async (c) => {
    const { user } = requireAuth(c);
    const body = await readJson(c);
    const today = zonedNow(user.timezone).day;
    if (typeof body.birthday !== 'string' || !isDay(body.birthday) || body.birthday < '1900-01-01' || body.birthday > today) {
      throw badRequest('Choose your birthday.');
    }
    const years = body.years === undefined ? SELF_LIMITS.yearsDefault : body.years;
    if (typeof years !== 'number' || !Number.isInteger(years) || years < SELF_LIMITS.yearsMin || years > SELF_LIMITS.yearsMax) {
      throw badRequest(`Choose between ${SELF_LIMITS.yearsMin} and ${SELF_LIMITS.yearsMax} years.`);
    }
    await c.env.DB.prepare(
      `INSERT INTO self_profiles (user_id, birthday, years, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET birthday = excluded.birthday, years = excluded.years, updated_at = excluded.updated_at`,
    )
      .bind(user.id, body.birthday, years, Date.now())
      .run();
    return c.json<SelfProfileDTO>({ birthday: body.birthday, years });
  })

  .post('/chapters', async (c) => {
    const { user } = requireAuth(c);
    const chapter = checkChapter(await readJson(c));
    if ((await countOf(c.env.DB, 'life_chapters', user.id)) >= SELF_LIMITS.chapters) throw new ApiError(409, 'too_many', 'That’s as many chapters as a life calendar holds.');
    const id = randomId();
    const now = Date.now();
    await c.env.DB.prepare('INSERT INTO life_chapters (id, user_id, title, start_day, end_day, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, user.id, chapter.title, chapter.start, chapter.end, chapter.color, now, now)
      .run();
    return c.json<LifeChapterDTO>({ id, ...chapter }, 201);
  })

  .patch('/chapters/:id', async (c) => {
    const { user } = requireAuth(c);
    const chapter = checkChapter(await readJson(c));
    const res = await c.env.DB.prepare('UPDATE life_chapters SET title = ?, start_day = ?, end_day = ?, color = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(chapter.title, chapter.start, chapter.end, chapter.color, Date.now(), c.req.param('id'), user.id)
      .run();
    if (!res.meta.changes) throw new ApiError(404, 'unknown_chapter', 'That chapter isn’t there any more.');
    return c.json<LifeChapterDTO>({ id: c.req.param('id'), ...chapter });
  })

  .delete('/chapters/:id', async (c) => {
    const { user } = requireAuth(c);
    const res = await c.env.DB.prepare('DELETE FROM life_chapters WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
    if (!res.meta.changes) throw new ApiError(404, 'unknown_chapter', 'That chapter isn’t there any more.');
    return c.body(null, 204);
  })

  .post('/notes', async (c) => {
    const { user } = requireAuth(c);
    const note = checkNote(await readJson(c));
    if ((await countOf(c.env.DB, 'life_notes', user.id)) >= SELF_LIMITS.notes) throw new ApiError(409, 'too_many', 'That’s as many notes as a life calendar holds.');
    const id = randomId();
    const now = Date.now();
    await c.env.DB.prepare('INSERT INTO life_notes (id, user_id, day, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, user.id, note.day, note.text, now, now)
      .run();
    return c.json<LifeNoteDTO>({ id, ...note }, 201);
  })

  .patch('/notes/:id', async (c) => {
    const { user } = requireAuth(c);
    const note = checkNote(await readJson(c));
    const res = await c.env.DB.prepare('UPDATE life_notes SET day = ?, text = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(note.day, note.text, Date.now(), c.req.param('id'), user.id)
      .run();
    if (!res.meta.changes) throw new ApiError(404, 'unknown_note', 'That note isn’t there any more.');
    return c.json<LifeNoteDTO>({ id: c.req.param('id'), ...note });
  })

  .delete('/notes/:id', async (c) => {
    const { user } = requireAuth(c);
    const res = await c.env.DB.prepare('DELETE FROM life_notes WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
    if (!res.meta.changes) throw new ApiError(404, 'unknown_note', 'That note isn’t there any more.');
    return c.body(null, 204);
  });
