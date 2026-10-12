// Our timeline: the milestones of a relationship, each with both partners' own memory of it.
// Milestones are a shared record you build together, not answers, so they're shared right away.

import { addDays } from './time';

export const TIMELINE_LIMITS = { titleMax: 120, placeMax: 120, memoryMax: 4000, songMax: 200, songUrlMax: 500 } as const;

export type MilestoneKind =
  | 'met'
  | 'first-chat'
  | 'first-date'
  | 'first-kiss'
  | 'official'
  | 'i-love-you'
  | 'family'
  | 'trip'
  | 'anniversary'
  | 'moved-in'
  | 'engaged'
  | 'married'
  | 'home'
  | 'baby'
  | 'other';

/** When a kind is offered as a suggestion, until there's one on the timeline. */
export type SuggestWhen = 'always' | 'married' | 'living-together' | 'kids' | 'after-a-year' | 'never';

export interface MilestoneKindInfo {
  id: MilestoneKind;
  /** In the picker. */
  label: string;
  /** A first title, to change if you like. Empty for "something else". */
  title: string;
  suggest: SuggestWhen;
}

/** In the order they usually happen, which is also the order suggestions appear in. */
export const MILESTONE_KINDS: readonly MilestoneKindInfo[] = [
  { id: 'met', label: 'The day we met', title: 'The day we met', suggest: 'always' },
  { id: 'first-chat', label: 'First chat', title: 'Our first chat', suggest: 'always' },
  { id: 'first-date', label: 'First date', title: 'Our first date', suggest: 'always' },
  { id: 'first-kiss', label: 'First kiss', title: 'Our first kiss', suggest: 'always' },
  { id: 'official', label: 'Made it official', title: 'We made it official', suggest: 'always' },
  { id: 'i-love-you', label: 'First “I love you”', title: 'The first “I love you”', suggest: 'always' },
  { id: 'family', label: 'Meeting the family', title: 'Meeting the family', suggest: 'always' },
  { id: 'trip', label: 'A trip together', title: 'Our first trip together', suggest: 'always' },
  { id: 'anniversary', label: 'An anniversary', title: 'Our first anniversary', suggest: 'after-a-year' },
  { id: 'moved-in', label: 'Moving in together', title: 'We moved in together', suggest: 'living-together' },
  { id: 'engaged', label: 'Engaged', title: 'We got engaged', suggest: 'married' },
  { id: 'married', label: 'Married', title: 'Our wedding', suggest: 'married' },
  { id: 'home', label: 'A new home', title: 'Our new home', suggest: 'never' },
  { id: 'baby', label: 'A new arrival', title: 'A new arrival', suggest: 'kids' },
  { id: 'other', label: 'Something else', title: '', suggest: 'never' },
];

export const MILESTONE_KIND_BY_ID = Object.fromEntries(MILESTONE_KINDS.map((k) => [k.id, k])) as Record<MilestoneKind, MilestoneKindInfo>;

export const isMilestoneKind = (value: unknown): value is MilestoneKind => typeof value === 'string' && value in MILESTONE_KIND_BY_ID;

export type DatePrecision = 'year' | 'month' | 'day';

export const precisionOf = (day: string): DatePrecision => (day.length === 4 ? 'year' : day.length === 7 ? 'month' : 'day');

/** YYYY, YYYY-MM or YYYY-MM-DD, a real date, from 1900 on. */
export function isMilestoneDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(day) || Number(day.slice(0, 4)) < 1900) return false;
  if (day.length === 4) return true;
  const month = Number(day.slice(5, 7));
  if (month < 1 || month > 12) return false;
  if (day.length === 7) return true;
  const date = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day);
}

/** The first day a milestone could have been: 2019 → 2019-01-01, 2019-06 → 2019-06-01. */
export const firstDayOf = (day: string): string => (day.length === 4 ? `${day}-01-01` : day.length === 7 ? `${day}-01` : day);

/** Still to come: planned for after today. */
export const isAhead = (day: string, today: string): boolean => firstDayOf(day) > today;

/** Up to ten years ahead, for something you've planned, like a wedding. */
export const latestMilestoneDay = (today: string): string => addDays(today, 3653);

/** "2019", "June 2019" or "June 14, 2019". */
export function milestoneDateLabel(day: string, locale?: string): string {
  if (day.length === 4) return day;
  const date = new Date(`${firstDayOf(day)}T12:00:00Z`);
  return day.length === 7
    ? date.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : date.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** How long ago, or how far off, as exactly as the date allows: "3 years ago", "In 5 months". */
export function timeFrom(day: string, today: string): string {
  const ahead = isAhead(day, today);
  const say = (n: number, unit: string) => (ahead ? `In ${plural(n, unit)}` : `${plural(n, unit)} ago`);
  const parts = (d: string) => d.split('-').map(Number) as [number, number, number];
  const [ty, tm] = parts(today);
  const precision = precisionOf(day);
  if (precision === 'year') {
    const years = Math.abs(Number(day) - ty);
    return years === 0 ? 'This year' : say(years, 'year');
  }
  if (precision === 'month') {
    const [y, m] = parts(day);
    const months = Math.abs((ty - y) * 12 + (tm - m));
    return months === 0 ? 'This month' : months >= 12 ? say(Math.floor(months / 12), 'year') : say(months, 'month');
  }
  // Whole months from the earlier date to the later one, then days.
  const [[ay, am, ad], [by, bm, bd]] = ahead ? [parts(today), parts(day)] : [parts(day), parts(today)];
  const months = (by - ay) * 12 + (bm - am) - (bd < ad ? 1 : 0);
  if (months >= 12) return say(Math.floor(months / 12), 'year');
  if (months >= 1) return say(months, 'month');
  const days = Math.round(Math.abs(Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return ahead ? 'Tomorrow' : 'Yesterday';
  return say(days, 'day');
}

/**
 * Milestones whose anniversary is today: exact days only, in an earlier year. A February 29
 * comes back on the 28th in other years.
 */
export function anniversariesOn<T extends { day: string }>(milestones: T[], today: string): { milestone: T; years: number }[] {
  const year = Number(today.slice(0, 4));
  const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
  const monthDay = today.slice(5);
  return milestones
    .filter((m) => precisionOf(m.day) === 'day' && Number(m.day.slice(0, 4)) < year)
    .filter((m) => m.day.slice(5) === monthDay || (!leap && monthDay === '02-28' && m.day.slice(5) === '02-29'))
    .map((milestone) => ({ milestone, years: year - Number(milestone.day.slice(0, 4)) }));
}

/** Sorts oldest first; a milestone known only by its year comes before the dated ones in it. */
export const byDay = (a: { day: string; createdAt: number }, b: { day: string; createdAt: number }) =>
  a.day < b.day ? -1 : a.day > b.day ? 1 : a.createdAt - b.createdAt;
