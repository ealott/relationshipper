import type { JournalDay } from '../shared/api';
import { isDay, isWeeklyDay, JOURNAL_PREFIX } from '../shared/journal';
import { zonedNow } from '../shared/time';
import { ApiError } from './http';
import type { QuestionRow } from './questions';
import { getQuestionStates } from './questionState';
import type { PairedContext } from './session';

type Couple = PairedContext['couple'];

export const journalQuestionId = (coupleId: string, day: string) => `${JOURNAL_PREFIX}${coupleId}-${day}`;

/** The day a journal question is about. */
export const journalDayOf = (questionId: string) => questionId.slice(-10);

/** "Monday, October 12", for a YYYY-MM-DD day. */
export const dayLabel = (day: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`));

/** Today in the couple's time zone. */
export const journalToday = (couple: Couple, now = new Date()) => zonedNow(couple.timezone, now).day;

/**
 * A day you can write about: today or earlier, back to the day you paired. `today` stands for
 * today in the couple's time zone.
 */
export function checkDay(couple: Couple, day: string, now = new Date()): string {
  const today = journalToday(couple, now);
  if (day === 'today') return today;
  if (!isDay(day)) throw new ApiError(400, 'bad_day', 'That isn’t a date.');
  if (day > today) throw new ApiError(400, 'future_day', 'That day hasn’t happened yet.');
  if (day < zonedNow(couple.timezone, new Date(couple.created_at)).day) throw new ApiError(400, 'before_couple', 'That’s before you paired.');
  return day;
}

/** The question holding a day of the couple's journal, created the first time the day is opened. */
export async function journalQuestion(db: D1Database, coupleId: string, day: string): Promise<QuestionRow> {
  const id = journalQuestionId(coupleId, day);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO questions (id, category, text, depth, audience, source, status, couple_id, author_id, created_at, updated_at)
       VALUES (?, NULL, ?, 1, NULL, 'journal', 'active', ?, NULL, ?, ?) ON CONFLICT (id) DO NOTHING`,
    )
    .bind(id, isWeeklyDay(day) ? 'How was your week?' : 'How was your day?', coupleId, now, now)
    .run();
  return (await db.prepare('SELECT * FROM questions WHERE id = ?').bind(id).first<QuestionRow>())!;
}

export async function getJournalDays(db: D1Database, coupleId: string, userId: string, days: string[]): Promise<JournalDay[]> {
  const states = await getQuestionStates(db, coupleId, userId, days.map((d) => journalQuestionId(coupleId, d)));
  return states.map((state, i) => ({ day: days[i]!, weekly: isWeeklyDay(days[i]!), questionId: state.questionId, state }));
}

/** Days either partner has written about, newest first. */
export async function listJournalDays(db: D1Database, coupleId: string, before: string, limit: number): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT substr(question_id, -10) AS day FROM answers
        WHERE couple_id = ?1 AND question_id LIKE ?2 AND substr(question_id, -10) < ?3
        ORDER BY day DESC LIMIT ?4`,
    )
    .bind(coupleId, `${JOURNAL_PREFIX}%`, before, limit)
    .all<{ day: string }>();
  return results.map((r) => r.day);
}
