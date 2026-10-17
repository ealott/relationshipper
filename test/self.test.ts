import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LifeChapterDTO, LifeNoteDTO, SelfResponse } from '../shared/api';
import { birthdayIn, lifeWeekDays, lifeWeekNumber, lifeWeekOf } from '../shared/self';
import { zonedNow } from '../shared/time';
import { createTestEnv, pairedCouple, signUp } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t?.dispose());

type Person = Awaited<ReturnType<typeof signUp>>;
const self = async (p: Person) => (await p.client.get<SelfResponse>('/api/self')).body;

describe('Self', () => {
  it('starts empty, then keeps your birthday and how many years to show', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    expect(await self(a)).toEqual({ today: zonedNow('America/New_York').day, profile: null, chapters: [], notes: [], milestones: [] });
    expect((await a.client.put('/api/self/profile', { birthday: '1990-10-03' })).body).toEqual({ birthday: '1990-10-03', years: 90 });
    await a.client.put('/api/self/profile', { birthday: '1990-10-03', years: 100 });
    expect((await self(a)).profile).toEqual({ birthday: '1990-10-03', years: 100 });
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    for (const bad of [{}, { birthday: '1899-12-31' }, { birthday: '1990-02-30' }, { birthday: tomorrow }, { birthday: '1990-10-03', years: 49 }, { birthday: '1990-10-03', years: 121 }, { birthday: '1990-10-03', years: 90.5 }]) {
      expect((await a.client.put('/api/self/profile', bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('holds the chapters of your life and notes on its days, checked', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    const college = await a.client.post<LifeChapterDTO>('/api/self/chapters', { title: '  College  ', start: '2008-08-25', end: '2012-05-12', color: 'teal' });
    expect(college.status).toBe(201);
    expect(college.body).toMatchObject({ title: 'College', start: '2008-08-25', end: '2012-05-12', color: 'teal' });
    const city = await a.client.post<LifeChapterDTO>('/api/self/chapters', { title: 'Living in Austin', start: '2015-06-01', color: 'amber' });
    expect(city.body.end).toBeNull();
    const add = (body: Record<string, unknown>) => a.client.post('/api/self/chapters', { title: 'X', start: '2010-01-01', color: 'rose', ...body });
    for (const bad of [{ title: ' ' }, { title: 'x'.repeat(81) }, { start: '2010-13-01' }, { start: undefined }, { end: '2009-12-31' }, { end: '1899-01-01' }, { color: 'plaid' }]) {
      expect((await add(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    const moved = await a.client.patch<LifeChapterDTO>(`/api/self/chapters/${city.body.id}`, { title: 'Austin', start: '2015-06-01', end: '2020-03-15', color: 'amber' });
    expect(moved.body).toMatchObject({ title: 'Austin', end: '2020-03-15' });

    // A note in the past is a moment; one ahead of today is a plan.
    const moment = await a.client.post<LifeNoteDTO>('/api/self/notes', { day: '2009-04-02', text: 'Saw the ocean for the first time.' });
    const plan = await a.client.post<LifeNoteDTO>('/api/self/notes', { day: '2031-06-01', text: 'Walk the Camino.' });
    expect(plan.status).toBe(201);
    expect((await a.client.post('/api/self/notes', { day: '2009-04-02', text: 'x'.repeat(501) })).status).toBe(400);
    expect((await a.client.post('/api/self/notes', { day: 'someday', text: 'Soon' })).status).toBe(400);
    expect((await a.client.post('/api/self/notes', { day: '2009-04-02', text: '  ' })).status).toBe(400);
    await a.client.patch(`/api/self/notes/${moment.body.id}`, { day: '2009-04-03', text: 'Saw the ocean.' });

    const mine = await self(a);
    expect(mine.chapters.map((c) => c.title)).toEqual(['College', 'Austin']);
    expect(mine.notes.map((n) => [n.day, n.text])).toEqual([
      ['2009-04-03', 'Saw the ocean.'],
      ['2031-06-01', 'Walk the Camino.'],
    ]);
    expect((await a.client.delete(`/api/self/chapters/${college.body.id}`)).status).toBe(204);
    expect((await a.client.delete(`/api/self/notes/${plan.body.id}`)).status).toBe(204);
    expect(await self(a)).toMatchObject({ chapters: [{ title: 'Austin' }], notes: [{ text: 'Saw the ocean.' }] });
  });

  it('is private: never your partner’s, never an admin’s', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.put('/api/self/profile', { birthday: '1991-02-14' });
    const chapter = await a.client.post<LifeChapterDTO>('/api/self/chapters', { title: 'SECRET-CHAPTER', start: '2010-01-01', color: 'rose' });
    const note = await a.client.post<LifeNoteDTO>('/api/self/notes', { day: '2012-01-01', text: 'SECRET-NOTE' });

    expect(await self(b)).toMatchObject({ profile: null, chapters: [], notes: [] });
    expect((await b.client.patch(`/api/self/chapters/${chapter.body.id}`, { title: 'Mine', start: '2010-01-01', color: 'rose' })).status).toBe(404);
    expect((await b.client.delete(`/api/self/chapters/${chapter.body.id}`)).status).toBe(404);
    expect((await b.client.patch(`/api/self/notes/${note.body.id}`, { day: '2012-01-01', text: 'Mine' })).status).toBe(404);
    expect((await b.client.delete(`/api/self/notes/${note.body.id}`)).status).toBe(404);
    const seen = await Promise.all(['/api/me', '/api/today', '/api/timeline', '/api/journal', '/api/export'].map((p) => b.client.get(p)));
    for (const r of seen) expect(r.raw).not.toMatch(/SECRET|1991-02-14/);

    const admin = await signUp(t.env, t.ctx, 'Admin', 'UTC', 'admin@example.com');
    const views = await Promise.all(['/api/admin/stats', '/api/admin/users', '/api/admin/questions'].map((p) => admin.client.get(p)));
    for (const r of views) expect(r.raw).not.toMatch(/SECRET|1991-02-14/);
    expect((await self(a)).chapters.map((c) => c.title)).toEqual(['SECRET-CHAPTER']);
  });

  it('shows our timeline’s milestones known to the day or the month', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await b.client.post('/api/timeline', { kind: 'met', title: 'The day we met', day: '2019-06-14' });
    await b.client.post('/api/timeline', { kind: 'moved-in', title: 'We moved in together', day: '2021-03' });
    await b.client.post('/api/timeline', { kind: 'trip', title: 'Lisbon', day: '2022' });
    expect((await self(a)).milestones.map((m) => [m.day, m.title])).toEqual([
      ['2019-06-14', 'The day we met'],
      ['2021-03', 'We moved in together'],
    ]);
  });

  it('works without a partner, stays when you unpair, and goes with your account', async () => {
    const single = await signUp(t.env, t.ctx, 'Robin');
    expect((await single.client.put('/api/self/profile', { birthday: '1990-10-03' })).status).toBe(200);
    expect((await self(single)).milestones).toEqual([]);

    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.put('/api/self/profile', { birthday: '1990-10-03' });
    await a.client.post('/api/self/chapters', { title: 'College', start: '2008-08-25', color: 'teal' });
    await a.client.post('/api/self/notes', { day: '2012-01-01', text: 'Mine' });
    await b.client.post('/api/couple/unpair');
    expect(await self(a)).toMatchObject({ profile: { birthday: '1990-10-03' }, chapters: [{ title: 'College' }], notes: [{ text: 'Mine' }] });
    await a.client.post('/api/me/delete', { confirm: 'DELETE' });
    for (const table of ['self_profiles', 'life_chapters', 'life_notes']) {
      const left = await t.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).bind(a.id).first<{ n: number }>();
      expect(left?.n, table).toBe(0);
    }
  });
});

describe('the life calendar', () => {
  it('puts each day in a year of life and a week of that year', () => {
    expect(lifeWeekOf('1990-10-03', '1990-10-03')).toEqual({ year: 0, week: 0 });
    expect(lifeWeekOf('1990-10-03', '1990-10-09')).toEqual({ year: 0, week: 0 });
    expect(lifeWeekOf('1990-10-03', '1990-10-10')).toEqual({ year: 0, week: 1 });
    // The last week of a year takes the day or two left over.
    expect(lifeWeekOf('1990-10-03', '1991-10-02')).toEqual({ year: 0, week: 51 });
    expect(lifeWeekDays('1990-10-03', { year: 0, week: 51 })).toEqual({ start: '1991-09-25', end: '1991-10-02' });
    expect(lifeWeekOf('1990-10-03', '1991-10-03')).toEqual({ year: 1, week: 0 });
    expect(lifeWeekOf('1990-10-03', '2026-10-17')).toEqual({ year: 36, week: 2 });
    expect(lifeWeekDays('1990-10-03', { year: 36, week: 2 })).toEqual({ start: '2026-10-17', end: '2026-10-23' });
    expect(lifeWeekNumber({ year: 36, week: 2 })).toBe(36 * 52 + 3);
    expect(lifeWeekOf('1990-10-03', '1990-10-02')).toBeNull();
  });

  it('keeps a February 29 birthday on the 28th in other years', () => {
    expect(birthdayIn('1992-02-29', 1)).toBe('1993-02-28');
    expect(birthdayIn('1992-02-29', 4)).toBe('1996-02-29');
    expect(lifeWeekOf('1992-02-29', '1993-02-28')).toEqual({ year: 1, week: 0 });
    expect(lifeWeekOf('1992-02-29', '1993-02-27')).toEqual({ year: 0, week: 51 });
  });
});
