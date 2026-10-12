import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MilestoneDTO, TimelineResponse } from '../shared/api';
import { addDays, zonedNow } from '../shared/time';
import { anniversariesOn, isMilestoneDay, milestoneDateLabel, timeFrom } from '../shared/timeline';
import { createTestEnv, pairedCouple, signUp } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t?.dispose());

/** Today in the test couples' time zone (America/New_York, from the test helper). */
const today = () => zonedNow('America/New_York').day;
const count = async (table: string) => (await t.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

describe('the timeline', () => {
  it('holds milestones either partner can add, change and remove, shared right away', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const date = await a.client.post<MilestoneDTO>('/api/timeline', { kind: 'first-date', title: '  Our first date  ', day: '2019-06-14', place: 'The pier' });
    expect(date.status).toBe(201);
    expect(date.body).toMatchObject({ kind: 'first-date', title: 'Our first date', day: '2019-06-14', place: 'The pier', createdBy: a.id, memories: [] });

    // As exactly as you remember: a year, or a month. A year comes before the days in it.
    const met = await b.client.post<MilestoneDTO>('/api/timeline', { kind: 'met', title: 'The day we met', day: '2019' });
    const moved = await a.client.post<MilestoneDTO>('/api/timeline', { kind: 'moved-in', title: 'We moved in together', day: '2021-03' });
    const seen = (await b.client.get<TimelineResponse>('/api/timeline')).body;
    expect(seen.today).toBe(today());
    expect(seen.milestones.map((m) => m.id)).toEqual([met.body.id, date.body.id, moved.body.id]);
    expect(seen.milestones[0]!.place).toBe('');

    const changed = await b.client.patch<MilestoneDTO>(`/api/timeline/${date.body.id}`, { title: 'First date, finally', day: '2019-06-15', place: null });
    expect(changed.body).toMatchObject({ kind: 'first-date', title: 'First date, finally', day: '2019-06-15', place: '' });
    expect((await a.client.get<MilestoneDTO>(`/api/timeline/${date.body.id}`)).body.title).toBe('First date, finally');

    expect((await b.client.delete(`/api/timeline/${moved.body.id}`)).status).toBe(204);
    expect((await a.client.get<TimelineResponse>('/api/timeline')).body.milestones.map((m) => m.id)).toEqual([met.body.id, date.body.id]);
    expect((await a.client.get(`/api/timeline/${moved.body.id}`)).status).toBe(404);
  });

  it('checks what it’s given', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    const add = (body: Record<string, unknown>) => a.client.post('/api/timeline', { kind: 'trip', title: 'Lisbon', day: '2022-05', ...body });
    expect((await add({ kind: 'breakup' })).status).toBe(400);
    expect((await add({ title: '  ' })).status).toBe(400);
    expect((await add({ title: 'x'.repeat(121) })).status).toBe(400);
    expect((await add({ place: 'x'.repeat(121) })).status).toBe(400);
    for (const day of ['2022-13', '2022-02-30', '1899', '22', '2022-5', 'last spring']) expect((await add({ day })).status, day).toBe(400);
    // Something planned, like a wedding, can be up to ten years ahead.
    expect((await add({ kind: 'married', title: 'Our wedding', day: addDays(today(), 400) })).status).toBe(201);
    expect((await add({ day: String(Number(today().slice(0, 4)) + 11) })).status).toBe(400);
    expect((await add({})).status).toBe(201);
    expect((await add({ kind: 'first-chat', title: 'Our first chat', day: '2019-05' })).status).toBe(201);
  });

  it('keeps each partner’s own memory of a milestone, with a song', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const { id } = (await a.client.post<MilestoneDTO>('/api/timeline', { kind: 'met', title: 'The day we met', day: '2019-06-01' })).body;
    const song = { songTitle: 'Dreams', songArtist: 'Fleetwood Mac', songUrl: 'https://open.spotify.com/track/abc' };
    const mine = await a.client.put<MilestoneDTO>(`/api/timeline/${id}/memory`, { text: 'You walked in late.', ...song });
    expect(mine.body.memories).toEqual([
      { userId: a.id, text: 'You walked in late.', song: { title: 'Dreams', artist: 'Fleetwood Mac', url: 'https://open.spotify.com/track/abc' }, updatedAt: expect.any(Number) },
    ]);
    const theirs = await b.client.put<MilestoneDTO>(`/api/timeline/${id}/memory`, { text: 'I was on time.' });
    expect(theirs.body.memories.map((m) => [m.userId, m.text, m.song])).toEqual([
      [a.id, 'You walked in late.', expect.any(Object)],
      [b.id, 'I was on time.', null],
    ]);

    // Editing yours leaves theirs alone; emptying it removes it.
    await a.client.put(`/api/timeline/${id}/memory`, { text: 'You walked in a little late.', ...song });
    const edited = (await b.client.get<MilestoneDTO>(`/api/timeline/${id}`)).body;
    expect(edited.memories.map((m) => m.text)).toEqual(['You walked in a little late.', 'I was on time.']);
    for (const songUrl of ['javascript:alert(1)', 'http://example.com/song', 'not a link']) {
      expect((await a.client.put(`/api/timeline/${id}/memory`, { text: 'x', songUrl })).status, songUrl).toBe(400);
    }
    expect((await a.client.put(`/api/timeline/${id}/memory`, { text: 'x'.repeat(4001) })).status).toBe(400);
    const emptied = await a.client.put<MilestoneDTO>(`/api/timeline/${id}/memory`, { text: '  ', songTitle: '', songArtist: '', songUrl: '' });
    expect(emptied.body.memories.map((m) => m.userId)).toEqual([b.id]);

    // Removing the milestone removes both memories.
    await b.client.delete(`/api/timeline/${id}`);
    const left = await t.env.DB.prepare('SELECT COUNT(*) AS n FROM milestone_memories WHERE milestone_id = ?').bind(id).first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  it('stays within the couple, and needs one', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    const { id } = (await a.client.post<MilestoneDTO>('/api/timeline', { kind: 'first-kiss', title: 'NOT-YOURS', day: '2020' })).body;
    const other = await pairedCouple(t.env, t.ctx);
    const theirs = await other.a.client.get<TimelineResponse>('/api/timeline');
    expect(theirs.body.milestones).toEqual([]);
    expect((await other.a.client.get(`/api/timeline/${id}`)).status).toBe(404);
    expect((await other.a.client.patch(`/api/timeline/${id}`, { title: 'Mine now' })).status).toBe(404);
    expect((await other.a.client.put(`/api/timeline/${id}/memory`, { text: 'Hi' })).status).toBe(404);
    expect((await other.a.client.delete(`/api/timeline/${id}`)).status).toBe(404);
    expect((await a.client.get<MilestoneDTO>(`/api/timeline/${id}`)).body.title).toBe('NOT-YOURS');
    const single = await signUp(t.env, t.ctx, 'Robin');
    expect((await single.client.get('/api/timeline')).status).toBe(409);
  });

  it('goes into the journal download, and goes when a couple unpairs', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx, ['Robin', 'Jules']);
    const { id } = (await a.client.post<MilestoneDTO>('/api/timeline', { kind: 'first-date', title: 'Our first date', day: '2019-06-14', place: 'The pier' })).body;
    await a.client.put(`/api/timeline/${id}/memory`, { text: 'ROBIN-REMEMBERS', songTitle: 'Dreams', songArtist: 'Fleetwood Mac', songUrl: 'https://example.com/dreams' });
    await b.client.put(`/api/timeline/${id}/memory`, { text: 'JULES-REMEMBERS' });
    const file = (await b.client.get('/api/export')).raw;
    expect(file).toContain('# Our timeline');
    expect(file).toContain('## June 14, 2019: Our first date\n\n_The pier_');
    expect(file).toContain('### Robin\n\nROBIN-REMEMBERS\n\nSong: Dreams, Fleetwood Mac (https://example.com/dreams)');
    expect(file).toContain('### Jules\n\nJULES-REMEMBERS');

    const before = [await count('milestones'), await count('milestone_memories')];
    await b.client.post('/api/couple/unpair');
    expect([await count('milestones'), await count('milestone_memories')]).toEqual([before[0]! - 1, before[1]! - 2]);
  });
});

describe('dates on the timeline', () => {
  it('can be a year, a month or a day', () => {
    for (const day of ['2019', '2019-06', '2019-06-14', '2024-02-29']) expect(isMilestoneDay(day), day).toBe(true);
    for (const day of ['1899', '2019-00', '2019-6', '2023-02-29', '2019-06-31', '', 2019]) expect(isMilestoneDay(day), String(day)).toBe(false);
    expect(milestoneDateLabel('2019', 'en-US')).toBe('2019');
    expect(milestoneDateLabel('2019-06', 'en-US')).toBe('June 2019');
    expect(milestoneDateLabel('2019-06-14', 'en-US')).toBe('June 14, 2019');
  });

  it('say how long ago, as exactly as the date allows', () => {
    const now = '2026-10-12';
    const cases: [string, string][] = [
      ['2019-06-14', '7 years ago'],
      ['2025-10-12', '1 year ago'],
      ['2025-10-13', '11 months ago'],
      ['2026-09-12', '1 month ago'],
      ['2026-09-13', '29 days ago'],
      ['2026-10-11', 'Yesterday'],
      ['2026-10-12', 'Today'],
      ['2026-10-13', 'Tomorrow'],
      ['2027-06-14', 'In 8 months'],
      ['2019-06', '7 years ago'],
      ['2026-08', '2 months ago'],
      ['2026-10', 'This month'],
      ['2026-12', 'In 2 months'],
      ['2019', '7 years ago'],
      ['2026', 'This year'],
      ['2028', 'In 2 years'],
    ];
    for (const [day, expected] of cases) expect(timeFrom(day, now), day).toBe(expected);
  });

  it('come back on their anniversary, exact days only', () => {
    const milestones = [{ day: '2019-10-12' }, { day: '2020-10' }, { day: '2026-10-12' }, { day: '2016-02-29' }];
    expect(anniversariesOn(milestones, '2026-10-12')).toEqual([{ milestone: { day: '2019-10-12' }, years: 7 }]);
    // February 29 comes back on the 28th in other years.
    expect(anniversariesOn(milestones, '2027-02-28').map((x) => x.years)).toEqual([11]);
    expect(anniversariesOn(milestones, '2028-02-28')).toEqual([]);
    expect(anniversariesOn(milestones, '2028-02-29').map((x) => x.years)).toEqual([12]);
  });
});
