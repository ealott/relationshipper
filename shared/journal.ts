// The couples journal: each day, each partner jots down a few short lines about their day.
// A day is a question of its own (source 'journal', one per couple per day), and an entry is
// stored as that question's answer, as JSON. So the reveal rule, replies, edit history and
// drafts work exactly as they do for questions.

import { wordCount } from './text';

/** Journal question ids are `journal-<couple id>-<YYYY-MM-DD>`. */
export const JOURNAL_PREFIX = 'journal-';

/**
 * The three prompts, each matching research in docs/research.md: sharing good news, support
 * through stress, and appreciation.
 */
export const JOURNAL_PROMPTS = [
  { key: 'good', prompt: 'Something good', heading: 'Good' },
  { key: 'hard', prompt: 'Something hard', heading: 'Hard' },
  { key: 'thanks', prompt: 'Something you appreciated about {partner}', heading: 'Thank you' },
] as const;

export type JournalPromptKey = (typeof JOURNAL_PROMPTS)[number]['key'];

export interface JournalEntry {
  good: string[];
  hard: string[];
  thanks: string[];
  /** The optional longer note ("Say more"); on Sundays, the look back at the week. */
  note: string;
}

export const JOURNAL_LIMITS = { lines: 10, lineMax: 280, noteMax: 10_000 } as const;

export const WEEKLY_PROMPT = 'Looking back on your week: what stood out, what weighed on you, and what do you want more of next week?';

export const emptyEntry = (): JournalEntry => ({ good: [], hard: [], thanks: [], note: '' });

export const isEmptyEntry = (e: JournalEntry) => !e.good.length && !e.hard.length && !e.thanks.length && !e.note.trim();

/** Words in an entry, across its lines and its note. */
export const entryWords = (e: JournalEntry) => wordCount([...e.good, ...e.hard, ...e.thanks, e.note].join(' '));

/** Sundays ask for a longer look back at the week. */
export const isWeeklyDay = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() === 0;

/** A real calendar date written YYYY-MM-DD. */
export function isDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day);
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/** Reads a stored entry. Anything unexpected becomes the note, so nothing written is ever hidden. */
export function parseEntry(text: string): JournalEntry {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return { good: strings(raw.good), hard: strings(raw.hard), thanks: strings(raw.thanks), note: typeof raw.note === 'string' ? raw.note : '' };
    }
  } catch {
    // not JSON
  }
  return { ...emptyEntry(), note: text };
}

/**
 * Tidies an entry from a client: one line per bullet, trimmed, empty ones dropped. Returns an
 * error message for an empty or oversized entry.
 */
export function normalizeEntry(input: unknown): JournalEntry | { error: string } {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const lines = (key: JournalPromptKey) =>
    strings(body[key])
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  const entry: JournalEntry = { good: lines('good'), hard: lines('hard'), thanks: lines('thanks'), note: typeof body.note === 'string' ? body.note.trim() : '' };
  if (isEmptyEntry(entry)) return { error: 'Write a line or two about your day first.' };
  for (const { key } of JOURNAL_PROMPTS) {
    if (entry[key].length > JOURNAL_LIMITS.lines) return { error: `Keep it to ${JOURNAL_LIMITS.lines} lines for each prompt.` };
    if (entry[key].some((l) => l.length > JOURNAL_LIMITS.lineMax)) return { error: `Keep each line under ${JOURNAL_LIMITS.lineMax} characters.` };
  }
  if (entry.note.length > JOURNAL_LIMITS.noteMax) return { error: `That’s a little long — keep it under ${JOURNAL_LIMITS.noteMax.toLocaleString('en-US')} characters.` };
  return entry;
}

/** The answer text an entry is stored as. */
export const serializeEntry = (e: JournalEntry) => JSON.stringify({ good: e.good, hard: e.hard, thanks: e.thanks, note: e.note });
