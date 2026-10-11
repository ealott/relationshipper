import { describe, expect, it } from 'vitest';
import { addDays, isValidTimeZone, minutesToTime, timeToMinutes, zonedNow } from '../shared/time';
import { computeStreak, fitsCouple, pickDailyQuestion } from '../worker/daily';
import type { QuestionRow } from '../worker/questions';
import { FIXTURE_QUESTIONS } from './helpers/fixtures';

const bank: QuestionRow[] = FIXTURE_QUESTIONS.map((q) => ({
  ...q,
  audience: q.audience ?? null,
  source: 'research',
  status: 'active',
  couple_id: null,
  author_id: null,
  created_at: 0,
  updated_at: 0,
}));
const unmarried = { include_intimacy: 0, married: 0, living_together: 0, has_kids: 0 };
const marriedParents = { include_intimacy: 0, married: 1, living_together: 1, has_kids: 1 };
const unknownStage = { include_intimacy: 0, married: null, living_together: null, has_kids: null };
const weeks = (n: number) => Array.from({ length: n * 7 }, (_, i) => `history-${i}`);
const MONDAY = '2026-10-12';
const SUNDAY = '2026-10-18';

const picks = (opts: Partial<Parameters<typeof pickDailyQuestion>[0]>, n = 500) => {
  const out: QuestionRow[] = [];
  for (let i = 0; i < n; i++) out.push(pickDailyQuestion({ bank, couple: unmarried, answered: new Set(), recent: [], day: MONDAY, ...opts })!);
  return out;
};

describe('pickDailyQuestion', () => {
  it('starts new couples with openers, then deepens over the first weeks', () => {
    expect(new Set(picks({ recent: [] }).map((q) => q.depth))).toEqual(new Set([1]));
    expect(Math.max(...picks({ recent: weeks(1) }).map((q) => q.depth))).toBe(2);
    expect(picks({ recent: weeks(4) }).some((q) => q.depth === 3)).toBe(true);
  });

  it('only offers stage-specific prompts that fit the couple', () => {
    const forUnmarried = new Set(picks({ couple: unmarried, recent: weeks(4) }).map((q) => q.audience));
    expect(forUnmarried.has('married') || forUnmarried.has('parents') || forUnmarried.has('together')).toBe(false);
    const forParents = new Set(picks({ couple: marriedParents, recent: weeks(4) }).map((q) => q.audience));
    expect(forParents.has('unmarried') || forParents.has('no-kids') || forParents.has('apart')).toBe(false);
    // Until a couple tells us their stage, no stage-specific prompts at all.
    expect(picks({ couple: unknownStage, recent: weeks(4) }).every((q) => q.audience === null)).toBe(true);
  });

  it('keeps intimacy prompts opt-in', () => {
    expect(picks({ recent: weeks(4) }).some((q) => q.category === 'intimacy')).toBe(false);
    expect(picks({ couple: { ...unmarried, include_intimacy: 1 }, recent: weeks(4) }, 2000).some((q) => q.category === 'intimacy')).toBe(true);
  });

  it('asks a check-in question on Sundays, once there’s a week of history', () => {
    expect(picks({ day: SUNDAY, recent: weeks(1) }, 50).every((q) => q.category === 'checkin')).toBe(true);
    expect(picks({ day: SUNDAY, recent: [] }, 200).some((q) => q.category === 'checkin')).toBe(false);
    expect(picks({ day: MONDAY, recent: weeks(2) }, 500).some((q) => q.category === 'checkin')).toBe(false);
  });

  it('skips answered and recent questions and rotates categories', () => {
    const answered = new Set(['love-maps-001', 'appreciation-001']);
    const recent = ['connection-001', ...weeks(1)];
    for (const q of picks({ answered, recent })) {
      expect(answered.has(q.id)).toBe(false);
      expect(q.id).not.toBe('connection-001');
      expect(q.category).not.toBe('connection');
    }
  });

  it('still returns something when everything has been answered', () => {
    const answered = new Set(bank.map((q) => q.id));
    expect(pickDailyQuestion({ bank, couple: unmarried, answered, recent: weeks(4), day: MONDAY })).not.toBeNull();
    expect(pickDailyQuestion({ bank: [], couple: unmarried, answered, recent: [], day: MONDAY })).toBeNull();
  });

  it('never offers retired or other couples’ questions', () => {
    expect(fitsCouple({ ...bank[0]!, status: 'retired' }, unmarried)).toBe(false);
    expect(fitsCouple({ ...bank[0]!, couple_id: 'someone' }, unmarried)).toBe(false);
  });
});

describe('computeStreak', () => {
  const row = (day: string, answers: number) => ({ day, answers });
  it('counts consecutive fully-answered days, without breaking on today', () => {
    expect(computeStreak([], '2026-10-11')).toBe(0);
    expect(computeStreak([row('2026-10-11', 2), row('2026-10-10', 2), row('2026-10-09', 2)], '2026-10-11')).toBe(3);
    expect(computeStreak([row('2026-10-11', 1), row('2026-10-10', 2)], '2026-10-11')).toBe(1);
    expect(computeStreak([row('2026-10-11', 2), row('2026-10-09', 2)], '2026-10-11')).toBe(1);
  });
});

describe('time helpers', () => {
  it('computes local day and minutes', () => {
    const at = new Date('2026-10-11T03:30:00Z');
    expect(zonedNow('UTC', at)).toEqual({ day: '2026-10-11', minutes: 210 });
    expect(zonedNow('America/Los_Angeles', at)).toEqual({ day: '2026-10-10', minutes: 20 * 60 + 30 });
    expect(zonedNow('Asia/Kolkata', at)).toEqual({ day: '2026-10-11', minutes: 9 * 60 });
  });
  it('handles DST, month ends and reminder times', () => {
    expect(zonedNow('Europe/London', new Date('2026-10-25T01:30:00Z')).minutes).toBe(90);
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(timeToMinutes('07:05')).toBe(425);
    expect(timeToMinutes('24:00')).toBeNull();
    expect(minutesToTime(425)).toBe('07:05');
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
