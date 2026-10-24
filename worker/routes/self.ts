import { Hono } from 'hono';
import type { Instrument, LifeChapterDTO, LifeNoteDTO, QuestionnairesResponse, SelfProfileDTO, SelfResponse, SelfResultDTO } from '../../shared/api';
import { isBigFiveAnswers, scoreBigFive } from '../../shared/bigFive';
import { isCheckInAnswers, scoreCheckIn } from '../../shared/checkIn';
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

/** Each questionnaire: whether a set of answers is complete and valid, and how it's scored. */
const INSTRUMENTS: Record<Instrument, { valid: (answers: unknown) => answers is number[]; score: (answers: number[]) => Record<string, number> }> = {
  'big-five': { valid: isBigFiveAnswers, score: scoreBigFive },
  'check-in': { valid: isCheckInAnswers, score: scoreCheckIn },
};

const isInstrument = (value: string): value is Instrument => Object.hasOwn(INSTRUMENTS, value);

interface ResultRow {
  id: string;
  instrument: Instrument;
  answers: string;
  created_at: number;
}

/** Scores only: answers are kept to recompute them, and never leave the server. */
const toResult = (r: ResultRow): SelfResultDTO => ({
  id: r.id,
  instrument: r.instrument,
  createdAt: r.created_at,
  scores: INSTRUMENTS[r.instrument].score(JSON.parse(r.answers) as number[]),
});

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
  })

  // Questionnaires (#63, #65): yours, and your partner's latest of each they've chosen to share.
  .get('/questionnaires', async (c) => {
    const { user, partner } = requireAuth(c);
    const db = c.env.DB;
    const [mine, sharing, theirs] = await db.batch([
      db.prepare('SELECT id, instrument, answers, created_at FROM self_results WHERE user_id = ? ORDER BY created_at DESC').bind(user.id),
      db.prepare('SELECT instrument FROM self_shares WHERE user_id = ? ORDER BY instrument').bind(user.id),
      // Only what they share, and only the latest of each.
      db
        .prepare(
          `SELECT r.id, r.instrument, r.answers, r.created_at FROM self_results r
             JOIN self_shares s ON s.user_id = r.user_id AND s.instrument = r.instrument
            WHERE r.user_id = ? AND r.created_at = (SELECT MAX(created_at) FROM self_results WHERE user_id = r.user_id AND instrument = r.instrument)`,
        )
        .bind(partner?.id ?? ''),
    ]);
    return c.json<QuestionnairesResponse>({
      mine: (mine!.results as unknown as ResultRow[]).filter((r) => isInstrument(r.instrument)).map(toResult),
      sharing: (sharing!.results as { instrument: string }[]).map((r) => r.instrument).filter(isInstrument),
      partner: (theirs!.results as unknown as ResultRow[]).filter((r) => isInstrument(r.instrument)).map((r) => {
        const { id: _id, ...result } = toResult(r);
        return result;
      }),
    });
  })

  .post('/questionnaires/:instrument', async (c) => {
    const { user } = requireAuth(c);
    const instrument = c.req.param('instrument');
    if (!isInstrument(instrument)) throw new ApiError(404, 'unknown_questionnaire', 'That questionnaire isn’t here.');
    const body = await readJson(c);
    if (!INSTRUMENTS[instrument].valid(body.answers)) throw badRequest('Answer every statement first.');
    const row: ResultRow = { id: randomId(), instrument, answers: JSON.stringify(body.answers), created_at: Date.now() };
    await c.env.DB.prepare('INSERT INTO self_results (id, user_id, instrument, answers, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(row.id, user.id, row.instrument, row.answers, row.created_at)
      .run();
    return c.json<SelfResultDTO>(toResult(row), 201);
  })

  .delete('/questionnaires/results/:id', async (c) => {
    const { user } = requireAuth(c);
    const db = c.env.DB;
    const [deleted] = await db.batch([
      db.prepare('DELETE FROM self_results WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id),
      // With none left there's nothing to share, so sharing stops instead of waiting, unseen, for the next one.
      db
        .prepare('DELETE FROM self_shares WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM self_results r WHERE r.user_id = self_shares.user_id AND r.instrument = self_shares.instrument)')
        .bind(user.id),
    ]);
    if (!deleted!.meta.changes) throw new ApiError(404, 'unknown_result', 'That result isn’t there any more.');
    return c.body(null, 204);
  })

  // Sharing is a choice, never required: your partner sees your latest scores while it's on.
  .put('/questionnaires/:instrument/share', async (c) => {
    const { user } = requireAuth(c);
    const instrument = c.req.param('instrument');
    if (!isInstrument(instrument)) throw new ApiError(404, 'unknown_questionnaire', 'That questionnaire isn’t here.');
    const body = await readJson(c);
    if (typeof body.shared !== 'boolean') throw badRequest('shared must be true or false.');
    const db = c.env.DB;
    if (body.shared) {
      await db.prepare('INSERT INTO self_shares (user_id, instrument, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(user.id, instrument, Date.now()).run();
    } else {
      await db.prepare('DELETE FROM self_shares WHERE user_id = ? AND instrument = ?').bind(user.id, instrument).run();
    }
    return c.body(null, 204);
  });
