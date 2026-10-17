// Self (#60): a private place for each person. It starts with a life calendar, after Tim Urban's
// "Your Life in Weeks": a square for every week of a life and a row for every year, with the
// chapters of that life in color and notes on the days they're about. Only its owner sees it.

import { isDay } from './journal';
import { addDays } from './time';

export const SELF_LIMITS = { chapterTitleMax: 80, noteMax: 500, chapters: 200, notes: 10_000, yearsMin: 50, yearsMax: 120, yearsDefault: 90 } as const;

/** Each year of a life shows as 52 weeks; the last one takes the day or two left over. */
export const WEEKS_PER_YEAR = 52;

export const CHAPTER_COLORS = ['rose', 'amber', 'sage', 'teal', 'blue', 'violet', 'slate'] as const;
export type ChapterColor = (typeof CHAPTER_COLORS)[number];
export const isChapterColor = (value: unknown): value is ChapterColor => typeof value === 'string' && (CHAPTER_COLORS as readonly string[]).includes(value);

/** The dates a life calendar can hold: a real day from 1900 to 2200. */
export const isLifeDay = (value: unknown): value is string => typeof value === 'string' && isDay(value) && value >= '1900-01-01' && value <= '2200-12-31';

const isLeapYear = (year: number) => new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;

/** The birthday `years` on, where that year of life starts. February 29 falls on the 28th in other years. */
export function birthdayIn(birthday: string, years: number): string {
  const year = Number(birthday.slice(0, 4)) + years;
  const monthDay = birthday.slice(5);
  return `${String(year).padStart(4, '0')}-${monthDay === '02-29' && !isLeapYear(year) ? '02-28' : monthDay}`;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export interface LifeWeek {
  /** The year of life, 0 from birth. */
  year: number;
  /** 0 to 51. */
  week: number;
}

/** The square a day falls in, or null before birth. */
export function lifeWeekOf(birthday: string, day: string): LifeWeek | null {
  if (day < birthday) return null;
  let year = Number(day.slice(0, 4)) - Number(birthday.slice(0, 4));
  if (birthdayIn(birthday, year) > day) year--;
  return { year, week: Math.min(WEEKS_PER_YEAR - 1, Math.floor(daysBetween(birthdayIn(birthday, year), day) / 7)) };
}

/** A square's first and last day. The last week of a year runs to the day before the next birthday. */
export function lifeWeekDays(birthday: string, { year, week }: LifeWeek): { start: string; end: string } {
  const start = addDays(birthdayIn(birthday, year), week * 7);
  return { start, end: week === WEEKS_PER_YEAR - 1 ? addDays(birthdayIn(birthday, year + 1), -1) : addDays(start, 6) };
}

/** Counting squares from 1 at birth. */
export const lifeWeekNumber = ({ year, week }: LifeWeek) => year * WEEKS_PER_YEAR + week + 1;
