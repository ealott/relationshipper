import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JournalDay, JournalResponse, VersionsResponse } from '../shared/api';
import { isWeeklyDay, parseEntry } from '../shared/journal';
import { addDays, zonedNow } from '../shared/time';
import { createTestEnv, pairedCouple } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t?.dispose());

/** A couple that paired a month ago, so past days can be written about. */
async function couple() {
  const c = await pairedCouple(t.env, t.ctx);
  await t.env.DB.prepare('UPDATE couples SET created_at = ? WHERE id = ?').bind(Date.now() - 30 * 86_400_000, c.coupleId).run();
  // The couple's time zone (America/New_York in the test helper) decides what "today" is.
  const today = zonedNow('America/New_York').day;
  return { ...c, today };
}

const entry = { good: ['A long lunch outside', '  '], hard: ['Waiting on test results'], thanks: ['Coffee was ready when I woke up'], note: '' };

describe('the journal', () => {
  it('shows your partner’s day only once you’ve written yours', async () => {
    const { a, b, today } = await couple();
    const written = await a.client.put<JournalDay>('/api/journal/today', { ...entry, good: ['ALEX-PRIVATE-DAY'] });
    expect(written.status).toBe(200);
    expect(written.body.day).toBe(today);
    expect(parseEntry(written.body.state.mine!.text)).toEqual({ good: ['ALEX-PRIVATE-DAY'], hard: entry.hard, thanks: entry.thanks, note: '' });

    for (const path of ['/api/journal', '/api/journal/today', `/api/journal/${today}`]) {
      const res = await b.client.get(path);
      expect(res.status, path).toBe(200);
      expect(res.raw, path).not.toContain('ALEX-PRIVATE-DAY');
    }
    const waiting = (await b.client.get<JournalDay>('/api/journal/today')).body;
    expect(waiting.state).toMatchObject({ mine: null, partnerAnswered: true, partner: null });
    const early = await b.client.get(`/api/questions/${waiting.questionId}/versions`);
    expect(early.status).toBe(409);

    const revealed = await b.client.put<JournalDay>(`/api/journal/${today}`, { good: [], hard: [], thanks: ['Sam’s thanks'], note: 'A longer note.' });
    expect(parseEntry(revealed.body.state.partner!.text).good).toEqual(['ALEX-PRIVATE-DAY']);
    const list = (await a.client.get<JournalResponse>('/api/journal')).body;
    expect(list.today).toBe(today);
    expect(list.days).toHaveLength(1);
    expect(parseEntry(list.days[0]!.state.partner!.text)).toEqual({ good: [], hard: [], thanks: ['Sam’s thanks'], note: 'A longer note.' });
  });

  it('checks the day and the entry', async () => {
    const { a, today } = await couple();
    expect((await a.client.put('/api/journal/today', { good: ['  '], hard: [], thanks: [], note: ' ' })).status).toBe(400);
    expect((await a.client.put('/api/journal/today', { ...entry, good: ['x'.repeat(281)] })).status).toBe(400);
    expect((await a.client.put('/api/journal/today', { ...entry, good: Array(11).fill('x') })).status).toBe(400);
    expect((await a.client.get('/api/journal/2026-13-45')).status).toBe(400);
    expect((await a.client.get('/api/journal/yesterday')).status).toBe(400);
    expect((await a.client.get(`/api/journal/${addDays(today, 1)}`)).status).toBe(400);
    expect((await a.client.get(`/api/journal/${addDays(today, -40)}`)).status).toBe(400); // before they paired
    const yesterday = await a.client.put<JournalDay>(`/api/journal/${addDays(today, -1)}`, entry);
    expect(yesterday.status).toBe(200);
    // A line is a line: newlines and runs of spaces collapse.
    const tidy = await a.client.put<JournalDay>('/api/journal/today', { good: ['one\ntwo   three'], hard: [], thanks: [], note: '' });
    expect(parseEntry(tidy.body.state.mine!.text).good).toEqual(['one two three']);
  });

  it('asks for a look back on Sundays', async () => {
    const { a, today } = await couple();
    let sunday = today;
    while (!isWeeklyDay(sunday)) sunday = addDays(sunday, -1);
    expect((await a.client.get<JournalDay>(`/api/journal/${sunday}`)).body.weekly).toBe(true);
    expect((await a.client.get<JournalDay>(`/api/journal/${addDays(sunday, -1)}`)).body.weekly).toBe(false);
  });

  it('lists the days you’ve written, newest first, a page at a time', async () => {
    const { a, b, today } = await couple();
    for (const n of [1, 3, 5]) await a.client.put(`/api/journal/${addDays(today, -n)}`, entry);
    await b.client.put(`/api/journal/${addDays(today, -2)}`, entry);
    await a.client.get(`/api/journal/${addDays(today, -4)}`); // opened but never written: not listed
    const first = (await a.client.get<JournalResponse>('/api/journal?limit=3')).body;
    expect(first.days.map((d) => d.day)).toEqual([1, 2, 3].map((n) => addDays(today, -n)));
    expect(first.nextCursor).toBe(addDays(today, -3));
    const next = (await a.client.get<JournalResponse>(`/api/journal?limit=3&before=${first.nextCursor}`)).body;
    expect(next.days.map((d) => d.day)).toEqual([addDays(today, -5)]);
    expect(next.nextCursor).toBeNull();
  });

  it('works with replies, edit history and drafts, like questions', async () => {
    const { a, b } = await couple();
    const opened = (await a.client.get<JournalDay>('/api/journal/today')).body;
    expect((await a.client.put(`/api/questions/${opened.questionId}/drafts/answer`, { text: '{"good":["half a thought"]}' })).status).toBe(200);
    // Entries go through the journal, which checks their shape.
    expect((await a.client.put(`/api/questions/${opened.questionId}/answer`, { text: 'free text' })).status).toBe(409);

    await a.client.put('/api/journal/today', entry);
    expect((await a.client.get(`/api/questions/${opened.questionId}/drafts`)).body.answer).toBeNull();
    await b.client.put('/api/journal/today', entry);
    const replied = await b.client.post(`/api/questions/${opened.questionId}/responses`, { text: 'That lunch sounds lovely.' });
    expect(replied.status).toBe(200);

    const edited = await a.client.put<JournalDay>('/api/journal/today', { ...entry, good: ['A long lunch outside, in the sun'] });
    expect(edited.body.state.mine!.editedAt).toEqual(expect.any(Number));
    const versions = (await b.client.get<VersionsResponse>(`/api/questions/${opened.questionId}/versions`)).body;
    expect(parseEntry(versions.answers[a.id]![0]!.text).good).toEqual(['A long lunch outside']);
  });

  it('stays out of the questions: progress, history, your questions and the badge', async () => {
    const { a, b } = await couple();
    const day = (await a.client.get<JournalDay>('/api/journal/today')).body;
    await a.client.put('/api/journal/today', entry);
    expect((await b.client.get('/api/progress')).body.progress[day.questionId]).toBeUndefined();
    expect((await b.client.get('/api/custom-questions')).raw).not.toContain(day.questionId);
    await b.client.put('/api/journal/today', entry);
    expect((await a.client.get('/api/history')).raw).not.toContain(day.questionId);
  });

  it('is in the journal download, written out as bullets', async () => {
    const { a, b, today } = await couple();
    await a.client.put('/api/journal/today', { ...entry, note: 'More about the lunch.' });
    await b.client.put('/api/journal/today', { good: [], hard: [], thanks: ['You listened'], note: '' });
    const journal = (await a.client.get('/api/export')).raw;
    expect(journal).toContain('# Our days');
    const heading = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'full' }).format(new Date(`${today}T12:00:00Z`));
    expect(journal).toContain(`## ${heading}`);
    expect(journal).toContain('**Good**\n- A long lunch outside\n\n**Hard**\n- Waiting on test results');
    expect(journal).toContain('More about the lunch.');
    expect(journal).toContain('**Thank you**\n- You listened');
    expect(journal).not.toContain('{"good"');
  });

  it('goes when you unpair', async () => {
    const { a, b, coupleId } = await couple();
    await a.client.put('/api/journal/today', entry);
    await b.client.post('/api/couple/unpair');
    const left = await t.env.DB.prepare(`SELECT COUNT(*) AS n FROM questions WHERE source = 'journal' AND couple_id = ?`).bind(coupleId).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
