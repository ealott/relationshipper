import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DateIdeaDTO, DateNightDTO, DatesResponse, MeResponse } from '../shared/api';
import { addDays, zonedNow } from '../shared/time';
import { calendarEvent, zonedTimeToUtc } from '../worker/ics';
import { createTestEnv, pairedCouple } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t?.dispose());

/** Today in the test couples' time zone (America/New_York, from the test helper). */
const today = () => zonedNow('America/New_York').day;

describe('date nights', () => {
  it('can be planned, moved and cancelled by either partner, and both see them', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const day = addDays(today(), 5);
    const planned = await a.client.post<DateNightDTO>('/api/dates', {
      day,
      time: '19:00',
      title: '  The Thai place on 5th  ',
      notes: 'Book a table',
      plannerId: a.id,
    });
    expect(planned.status).toBe(201);
    expect(planned.body).toMatchObject({ day, time: '19:00', title: 'The Thai place on 5th', notes: 'Book a table', plannerId: a.id, createdBy: a.id });

    const seen = (await b.client.get<DatesResponse>('/api/dates')).body;
    expect(seen.today).toBe(today());
    expect(seen.upcoming.map((d) => d.id)).toEqual([planned.body.id]);

    const moved = await b.client.patch<DateNightDTO>(`/api/dates/${planned.body.id}`, { day: addDays(day, 1), time: null, plannerId: null });
    expect(moved.body).toMatchObject({ day: addDays(day, 1), time: null, plannerId: null, title: 'The Thai place on 5th' });

    // Upcoming dates come soonest first; past ones go to the past, newest first.
    const later = await a.client.post<DateNightDTO>('/api/dates', { day: addDays(day, 10), title: 'Picnic' });
    const soon = await a.client.post<DateNightDTO>('/api/dates', { day: today(), time: '20:00', title: 'Tonight' });
    await t.env.DB.prepare('UPDATE couples SET created_at = ? WHERE id = (SELECT couple_id FROM users WHERE id = ?)').bind(Date.now() - 30 * 86_400_000, a.id).run();
    const past = await a.client.post<DateNightDTO>('/api/dates', { day: addDays(today(), -3), title: 'Bowling' });
    const list = (await a.client.get<DatesResponse>('/api/dates')).body;
    expect(list.upcoming.map((d) => d.id)).toEqual([soon.body.id, planned.body.id, later.body.id]);
    expect(list.past.map((d) => d.id)).toEqual([past.body.id]);

    expect((await b.client.delete(`/api/dates/${planned.body.id}`)).status).toBe(204);
    expect((await a.client.get<DatesResponse>('/api/dates')).body.upcoming.map((d) => d.id)).toEqual([soon.body.id, later.body.id]);
  });

  it('checks what it’s given', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    const plan = (body: Record<string, unknown>) => a.client.post('/api/dates', { day: addDays(today(), 1), title: 'Dinner', ...body });
    expect((await plan({ title: '   ' })).status).toBe(400);
    expect((await plan({ title: 'x'.repeat(121) })).status).toBe(400);
    expect((await plan({ day: '2026-02-30' })).status).toBe(400);
    expect((await plan({ day: addDays(today(), -1) })).status).toBe(400); // before they paired
    expect((await plan({ day: addDays(today(), 731) })).status).toBe(400);
    expect((await plan({ time: '7pm' })).status).toBe(400);
    expect((await plan({ notes: 'x'.repeat(1001) })).status).toBe(400);
    const stranger = await pairedCouple(t.env, t.ctx);
    expect((await plan({ plannerId: stranger.a.id })).status).toBe(400);
    expect((await plan({})).status).toBe(201);
  });

  it('keep a shared list of ideas; removing one leaves its dates alone', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const idea = await a.client.post<DateIdeaDTO>('/api/date-ideas', { title: 'Pottery class', notes: 'The studio on Main', setting: 'out' });
    expect(idea.status).toBe(201);
    expect(idea.body).toMatchObject({ title: 'Pottery class', setting: 'out', authorId: a.id });
    expect((await a.client.post('/api/date-ideas', { title: 'x', setting: 'garden' })).status).toBe(400);

    const edited = await b.client.patch<DateIdeaDTO>(`/api/date-ideas/${idea.body.id}`, { setting: null, notes: '' });
    expect(edited.body).toMatchObject({ title: 'Pottery class', setting: null, notes: '' });
    const date = await b.client.post<DateNightDTO>('/api/dates', { day: addDays(today(), 2), title: 'Pottery class', ideaId: idea.body.id });
    expect(date.body.ideaId).toBe(idea.body.id);
    expect((await b.client.get<DatesResponse>('/api/dates')).body.ideas.map((i) => i.id)).toEqual([idea.body.id]);

    expect((await a.client.delete(`/api/date-ideas/${idea.body.id}`)).status).toBe(204);
    const after = (await a.client.get<DatesResponse>('/api/dates')).body;
    expect(after.ideas).toEqual([]);
    expect(after.upcoming[0]).toMatchObject({ id: date.body.id, ideaId: null, title: 'Pottery class' });
  });

  it('stay within the couple', async () => {
    const one = await pairedCouple(t.env, t.ctx);
    const two = await pairedCouple(t.env, t.ctx);
    const date = await one.a.client.post<DateNightDTO>('/api/dates', { day: addDays(today(), 1), title: 'ONE-ONLY' });
    const idea = await one.a.client.post<DateIdeaDTO>('/api/date-ideas', { title: 'ONE-IDEA' });
    expect((await two.a.client.get('/api/dates')).raw).not.toContain('ONE-');
    expect((await two.a.client.patch(`/api/dates/${date.body.id}`, { title: 'mine now' })).status).toBe(404);
    expect((await two.a.client.delete(`/api/dates/${date.body.id}`)).status).toBe(404);
    expect((await two.a.client.get(`/api/dates/${date.body.id}/calendar.ics`)).status).toBe(404);
    expect((await two.a.client.patch(`/api/date-ideas/${idea.body.id}`, { title: 'mine now' })).status).toBe(404);
    expect((await two.a.client.delete(`/api/date-ideas/${idea.body.id}`)).status).toBe(404);
    // An idea from another couple can't be attached.
    const borrowed = await two.a.client.post<DateNightDTO>('/api/dates', { day: addDays(today(), 1), title: 'x', ideaId: idea.body.id });
    expect(borrowed.body.ideaId).toBeNull();
  });

  it('can go on your phone’s calendar', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    // Winter and summer, either side of daylight saving time in New York.
    expect(zonedTimeToUtc('2026-12-05', '19:00', 'America/New_York').toISOString()).toBe('2026-12-06T00:00:00.000Z');
    expect(zonedTimeToUtc('2027-07-03', '19:00', 'America/New_York').toISOString()).toBe('2027-07-03T23:00:00.000Z');
    expect(zonedTimeToUtc('2027-07-03', '19:00', 'Europe/London').toISOString()).toBe('2027-07-03T18:00:00.000Z');

    const date = await a.client.post<DateNightDTO>('/api/dates', { day: '2026-12-05', time: '19:00', title: 'Dinner, then a show; finally home', notes: 'Line one\nLine two' });
    const ics = await a.client.get(`/api/dates/${date.body.id}/calendar.ics`);
    expect(ics.status).toBe(200);
    expect(ics.headers.get('content-type')).toContain('text/calendar');
    expect(ics.raw).toContain('DTSTART:20261206T000000Z\r\nDTEND:20261206T020000Z');
    expect(ics.raw).toContain('SUMMARY:Date night: Dinner\\, then a show\\; finally home');
    expect(ics.raw).toContain('DESCRIPTION:Line one\\nLine two');
    expect(ics.raw).toContain(`UID:${date.body.id}@`);

    const allDay = calendarEvent({ uid: 'x@y', day: '2026-12-31', time: null, timeZone: 'America/New_York', title: 'x'.repeat(100), notes: '', url: 'https://example.com/dates' });
    expect(allDay).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101');
    expect(allDay.split('\r\n').every((line) => line.length <= 75)).toBe(true);
  });

  it('are in the journal download, and go when you unpair', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.post('/api/dates', { day: addDays(today(), 1), time: '18:30', title: 'Climbing gym', notes: 'Bring socks', plannerId: b.id });
    await a.client.post('/api/date-ideas', { title: 'Stargazing' });
    const journal = (await a.client.get('/api/export')).raw;
    expect(journal).toContain('# Date nights');
    expect(journal).toMatch(/- \*\*\w+day, \w+ \d+, \d{4}, 6:30 PM\*\*: Climbing gym \(Sam planned it\)\n {2}Bring socks/);

    await b.client.post('/api/couple/unpair');
    const left = await t.env.DB.prepare(
      'SELECT (SELECT COUNT(*) FROM date_nights WHERE created_by = ?1) + (SELECT COUNT(*) FROM date_ideas WHERE author_id = ?1) AS n',
    )
      .bind(a.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it('notifications can be turned off in settings', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    expect((await a.client.get<MeResponse>('/api/me')).body.user.notifyDates).toBe(true);
    expect((await a.client.patch<MeResponse>('/api/me', { notifyDates: false })).body.user.notifyDates).toBe(false);
  });
});
