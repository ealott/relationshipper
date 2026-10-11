import type { Audience } from '../shared/questions/types';
import { addDays, zonedNow } from '../shared/time';
import { ApiError } from './http';
import { getBank, type QuestionRow } from './questions';
import type { CoupleRow } from './session';

export type DailyCouple = Pick<CoupleRow, 'id' | 'timezone' | 'include_intimacy' | 'married' | 'living_together' | 'has_kids'>;
type Stage = Pick<CoupleRow, 'include_intimacy' | 'married' | 'living_together' | 'has_kids'>;

// Stage-specific prompts need the couple to have told us their stage (NULL = unknown → skip).
const AUDIENCE: Record<Audience, (c: Stage) => boolean> = {
  unmarried: (c) => c.married === 0,
  married: (c) => c.married === 1,
  'no-kids': (c) => c.has_kids === 0,
  parents: (c) => c.has_kids === 1,
  apart: (c) => c.living_together === 0,
  together: (c) => c.living_together === 1,
};

export function fitsCouple(q: Pick<QuestionRow, 'status' | 'category' | 'audience' | 'couple_id'>, c: Stage): boolean {
  if (q.status !== 'active' || q.couple_id !== null) return false;
  if (q.category === 'intimacy' && c.include_intimacy !== 1) return false;
  if (!q.audience) return true;
  return AUDIENCE[q.audience as Audience]?.(c) ?? false;
}

/** Days into the ritual before deeper prompts are offered (gradual, reciprocal self-disclosure). */
export const DEPTH_UNLOCKS = { reflective: 7, deep: 21 } as const;
/** Weekly check-in: Sundays, once a couple has a week of history. */
const CHECKIN_WEEKDAY = 0;

export function pickDailyQuestion(opts: {
  bank: QuestionRow[];
  couple: Stage;
  /** Question ids either partner has answered. */
  answered: ReadonlySet<string>;
  /** Previous daily question ids, most recent first. */
  recent: readonly string[];
  /** The couple's local date being assigned (YYYY-MM-DD). */
  day: string;
  random?: () => number;
}): QuestionRow | null {
  const random = opts.random ?? Math.random;
  const pick = <T>(xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(random() * xs.length))]!;
  const eligible = opts.bank.filter((q) => fitsCouple(q, opts.couple));
  if (!eligible.length) return null;

  const daysIn = opts.recent.length;
  const maxDepth = daysIn < DEPTH_UNLOCKS.reflective ? 1 : daysIn < DEPTH_UNLOCKS.deep ? 2 : 3;
  const recent = new Set(opts.recent);
  const fresh = eligible.filter((q) => !opts.answered.has(q.id) && !recent.has(q.id));
  // Prefer the allowed depth; widen only if nothing is left at it.
  const withinDepth = (xs: QuestionRow[]) => {
    for (let d = maxDepth; d <= 3; d++) {
      const p = xs.filter((q) => q.depth <= d);
      if (p.length) return p;
    }
    return xs;
  };

  const weekday = new Date(`${opts.day}T12:00:00Z`).getUTCDay();
  if (weekday === CHECKIN_WEEKDAY && daysIn >= 6) {
    const checkins = fresh.filter((q) => q.category === 'checkin');
    if (checkins.length) return pick(checkins);
  }

  let pool = withinDepth(fresh.filter((q) => q.category !== 'checkin'));
  if (!pool.length) pool = withinDepth(fresh);
  if (!pool.length) {
    // Everything has been asked: repeat prompts that haven't come up lately.
    const lately = new Set(opts.recent.slice(0, 60));
    pool = eligible.filter((q) => !lately.has(q.id));
    if (!pool.length) pool = eligible;
  }

  // Rotate categories: don't repeat yesterday's when there's a choice.
  const yesterday = opts.bank.find((q) => q.id === opts.recent[0])?.category;
  let categories = [...new Set(pool.map((q) => q.category))];
  if (categories.length > 1) categories = categories.filter((c) => c !== yesterday);
  const category = pick(categories);
  return pick(pool.filter((q) => q.category === category));
}

/** The couple's question for today (in the couple's timezone), assigning one on first request. */
export async function getOrAssignDaily(db: D1Database, couple: DailyCouple, now = new Date()): Promise<{ day: string; questionId: string }> {
  const { day } = zonedNow(couple.timezone, now);
  const select = db.prepare('SELECT question_id FROM daily_questions WHERE couple_id = ? AND day = ?').bind(couple.id, day);
  const existing = await select.first<{ question_id: string }>();
  if (existing) return { day, questionId: existing.question_id };

  const [answered, recent] = await db.batch<{ question_id: string }>([
    db.prepare('SELECT DISTINCT question_id FROM answers WHERE couple_id = ?').bind(couple.id),
    db.prepare('SELECT question_id FROM daily_questions WHERE couple_id = ? AND day < ? ORDER BY day DESC LIMIT 400').bind(couple.id, day),
  ]);
  const question = pickDailyQuestion({
    bank: await getBank(db),
    couple,
    answered: new Set(answered!.results.map((r) => r.question_id)),
    recent: recent!.results.map((r) => r.question_id),
    day,
  });
  if (!question) throw new ApiError(503, 'no_questions', 'There are no questions available yet.');
  // Both partners may load the app at the same moment: the first insert wins.
  await db.prepare('INSERT OR IGNORE INTO daily_questions (couple_id, day, question_id) VALUES (?, ?, ?)').bind(couple.id, day, question.id).run();
  const row = await select.first<{ question_id: string }>();
  return { day, questionId: row!.question_id };
}

/** Consecutive days (ending today, or yesterday if today is still open) on which both partners answered. */
export function computeStreak(rows: readonly { day: string; answers: number }[], today: string): number {
  let streak = 0;
  let expected = addDays(today, -1);
  for (const r of rows) {
    if (r.day > today) continue;
    if (r.day === today) {
      if (r.answers >= 2) streak++;
      continue;
    }
    if (r.day !== expected || r.answers < 2) break;
    streak++;
    expected = addDays(expected, -1);
  }
  return streak;
}

export async function getStreak(db: D1Database, coupleId: string, today: string): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT d.day,
              (SELECT COUNT(*) FROM answers a WHERE a.couple_id = d.couple_id AND a.question_id = d.question_id) AS answers
         FROM daily_questions d
        WHERE d.couple_id = ?1 AND d.day <= ?2
        ORDER BY d.day DESC
        LIMIT 400`,
    )
    .bind(coupleId, today)
    .all<{ day: string; answers: number }>();
  return computeStreak(results, today);
}
