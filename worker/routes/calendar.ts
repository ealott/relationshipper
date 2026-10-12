import { Hono, type Context } from 'hono';
import type { CalendarFeedResponse } from '../../shared/api';
import { addDays, zonedNow } from '../../shared/time';
import type { DateNightRow } from '../dates';
import type { HonoEnv } from '../env';
import { calendarFeed } from '../ics';
import { randomToken } from '../lib/crypto';
import { requireAuth, requireCouple } from '../session';

// Date nights in Google Calendar or Apple Calendar (#35): a private feed per person, for a
// calendar app to subscribe to. The link is the key, since calendar apps can't sign in.

/** How far back the feed goes, so recent dates stay in your calendar. */
const FEED_PAST_DAYS = 90;

const feedUrl = (c: Context<HonoEnv>, token: string) => `${new URL(c.req.url).origin}/api/calendar/${token}.ics`;

export const calendarRoutes = new Hono<HonoEnv>()
  // Your feed link, if it's on.
  .get('/', async (c) => {
    const { user } = requireCouple(c);
    const row = await c.env.DB.prepare('SELECT token, fetched_at FROM calendar_feeds WHERE user_id = ?')
      .bind(user.id)
      .first<{ token: string; fetched_at: number | null }>();
    return c.json<CalendarFeedResponse>({ url: row ? feedUrl(c, row.token) : null, fetchedAt: row?.fetched_at ?? null });
  })

  // Turns your feed on, or gives it a new link; the old link stops working.
  .post('/', async (c) => {
    const { user } = requireCouple(c);
    const token = randomToken(24);
    await c.env.DB.prepare(
      `INSERT INTO calendar_feeds (user_id, token, created_at) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at, fetched_at = NULL`,
    )
      .bind(user.id, token, Date.now())
      .run();
    return c.json<CalendarFeedResponse>({ url: feedUrl(c, token), fetchedAt: null });
  })

  .delete('/', async (c) => {
    const { user } = requireAuth(c);
    await c.env.DB.prepare('DELETE FROM calendar_feeds WHERE user_id = ?').bind(user.id).run();
    return c.body(null, 204);
  })

  // The feed itself, fetched by calendar apps without a session.
  .get('/:file', async (c) => {
    const token = /^([A-Za-z0-9_-]{20,64})\.ics$/.exec(c.req.param('file'))?.[1];
    const db = c.env.DB;
    const owner = token
      ? await db
          .prepare(
            `SELECT f.user_id, u.couple_id, cp.timezone, p.id AS partner_id, p.name AS partner_name
               FROM calendar_feeds f
               JOIN users u ON u.id = f.user_id
               JOIN couples cp ON cp.id = u.couple_id
               LEFT JOIN users p ON p.couple_id = u.couple_id AND p.id != u.id
              WHERE f.token = ?`,
          )
          .bind(token)
          .first<{ user_id: string; couple_id: string; timezone: string; partner_id: string | null; partner_name: string | null }>()
      : null;
    if (!owner) return c.text('Not found', 404);

    const today = zonedNow(owner.timezone).day;
    const { results } = await db
      .prepare('SELECT * FROM date_nights WHERE couple_id = ? AND day >= ? ORDER BY day, start_time LIMIT 500')
      .bind(owner.couple_id, addDays(today, -FEED_PAST_DAYS))
      .all<DateNightRow>();
    const origin = new URL(c.req.url).origin;
    const who = (d: DateNightRow) =>
      d.planner_id === null ? 'You’re planning it together.' : d.planner_id === owner.user_id ? 'You’re planning it.' : `${owner.partner_name ?? 'Your partner'} is planning it.`;
    const body = calendarFeed(
      'Date nights',
      results.map((d) => ({
        uid: `${d.id}@${new URL(origin).host}`,
        day: d.day,
        time: d.start_time,
        timeZone: owner.timezone,
        title: d.title,
        notes: [who(d), d.notes].filter(Boolean).join('\n\n'),
        url: `${origin}/dates`,
        updatedAt: d.updated_at,
      })),
    );
    // Shows in the app that the calendar is reading it; written at most every few minutes.
    const now = Date.now();
    c.executionCtx.waitUntil(
      db.prepare('UPDATE calendar_feeds SET fetched_at = ?1 WHERE user_id = ?2 AND (fetched_at IS NULL OR fetched_at < ?1 - 300000)').bind(now, owner.user_id).run(),
    );
    c.header('Content-Type', 'text/calendar; charset=utf-8');
    return c.body(body);
  });
