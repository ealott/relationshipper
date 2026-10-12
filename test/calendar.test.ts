import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CalendarFeedResponse, DateNightDTO } from '../shared/api';
import { addDays, zonedNow } from '../shared/time';
import { calendarFeed } from '../worker/ics';
import { createTestEnv, pairedCouple, signUp, TestClient } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t?.dispose());

/** Today in the test couples' time zone (America/New_York, from the test helper). */
const today = () => zonedNow('America/New_York').day;
/** A calendar app: no cookies, just the link. */
const fetchFeed = (url: string) => new TestClient(t.env, t.ctx).get(new URL(url).pathname);

describe('calendar feeds', () => {
  it('give each partner a private feed of your date nights, for any calendar app', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    expect((await a.client.get<CalendarFeedResponse>('/api/calendar')).body).toEqual({ url: null, fetchedAt: null });
    const { url } = (await a.client.post<CalendarFeedResponse>('/api/calendar')).body;
    expect(url).toMatch(/^http:\/\/localhost\/api\/calendar\/[A-Za-z0-9_-]{32}\.ics$/);

    const day = addDays(today(), 3);
    await b.client.post<DateNightDTO>('/api/dates', { day, time: '19:00', title: 'Dinner, then a show', notes: 'Book a table', plannerId: b.id });
    await a.client.post<DateNightDTO>('/api/dates', { day: addDays(today(), 5), title: 'Picnic' });
    // Recent dates stay; ones from months ago drop off.
    const coupleId = (await t.env.DB.prepare('SELECT couple_id FROM users WHERE id = ?').bind(a.id).first<{ couple_id: string }>())!.couple_id;
    for (const [id, ago] of [['recent', 10], ['old', 100]] as const) {
      await t.env.DB.prepare(`INSERT INTO date_nights (id, couple_id, day, title, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)`)
        .bind(`${id}-${coupleId}`, coupleId, addDays(today(), -ago), `${id} date`)
        .run();
    }
    const others = await pairedCouple(t.env, t.ctx);
    await others.a.client.post('/api/dates', { day, title: 'NOT-YOURS' });

    const feed = await fetchFeed(url!);
    expect(feed.status).toBe(200);
    expect(feed.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(feed.raw).toContain('X-WR-CALNAME:Date nights');
    expect(feed.raw).toContain('SUMMARY:Date night: Dinner\\, then a show');
    expect(feed.raw).toContain('DESCRIPTION:Sam is planning it.\\n\\nBook a table');
    expect(feed.raw).toContain('SUMMARY:Date night: Picnic');
    expect(feed.raw).toContain('DESCRIPTION:You’re planning it together.');
    expect(feed.raw).toContain('SUMMARY:Date night: recent date');
    expect(feed.raw).not.toContain('old date');
    expect(feed.raw).not.toContain('NOT-YOURS');
    expect(feed.raw.match(/BEGIN:VEVENT/g)).toHaveLength(3);

    // The app shows that a calendar is reading it.
    await t.ctx.flush();
    expect((await a.client.get<CalendarFeedResponse>('/api/calendar')).body.fetchedAt).toEqual(expect.any(Number));

    // Sam's own link is separate, and says it from Sam's side.
    const theirs = (await b.client.post<CalendarFeedResponse>('/api/calendar')).body.url!;
    expect(theirs).not.toBe(url);
    expect((await fetchFeed(theirs)).raw).toContain('DESCRIPTION:You’re planning it.\\n\\nBook a table');
  });

  it('can get a new link, or be turned off', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    const first = (await a.client.post<CalendarFeedResponse>('/api/calendar')).body.url!;
    const second = (await a.client.post<CalendarFeedResponse>('/api/calendar')).body.url!;
    expect(second).not.toBe(first);
    expect((await fetchFeed(first)).status).toBe(404);
    expect((await fetchFeed(second)).status).toBe(200);
    expect((await a.client.get<CalendarFeedResponse>('/api/calendar')).body.url).toBe(second);

    expect((await a.client.delete('/api/calendar')).status).toBe(204);
    expect((await a.client.get<CalendarFeedResponse>('/api/calendar')).body.url).toBeNull();
    expect((await fetchFeed(second)).status).toBe(404);
    for (const path of ['/api/calendar/nope.ics', `/api/calendar/${'a'.repeat(32)}.ics`, `/api/calendar/${'a'.repeat(32)}`]) {
      expect((await new TestClient(t.env, t.ctx).get(path)).status, path).toBe(404);
    }
  });

  it('stops when a couple unpairs, and needs one to start', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const url = (await a.client.post<CalendarFeedResponse>('/api/calendar')).body.url!;
    await b.client.post('/api/couple/unpair');
    expect((await fetchFeed(url)).status).toBe(404);
    const left = await t.env.DB.prepare('SELECT COUNT(*) AS n FROM calendar_feeds WHERE user_id = ?').bind(a.id).first<{ n: number }>();
    expect(left!.n).toBe(0);
    const single = await signUp(t.env, t.ctx, 'Robin');
    expect((await single.client.post('/api/calendar')).status).toBe(409);
  });

  it('folds long lines without splitting a character', () => {
    const title = 'Dîner 🌙 sous les étoiles, '.repeat(6);
    const feed = calendarFeed('Date nights', [{ uid: 'x@y', day: '2026-12-31', time: '20:00', timeZone: 'Europe/Paris', title, notes: '', url: 'https://example.com/dates' }]);
    const lines = feed.split('\r\n');
    expect(lines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    const unfolded = feed.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:Date night: ${title.replaceAll(',', '\\,')}`);
    expect(unfolded).toContain('DTSTART:20261231T190000Z');
  });
});
