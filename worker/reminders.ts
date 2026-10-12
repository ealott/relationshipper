import { DATE_REMINDER_MINUTES, formatClock } from '../shared/dates';
import { addDays, timeToMinutes, zonedNow } from '../shared/time';
import { getOrAssignDaily } from './daily';
import type { AppEnv } from './env';
import { pushToUser, quote, vapidKeys, type PushPayload } from './notify';
import { findQuestion } from './questions';
import { countYourTurn } from './questionState';

/** How long after the chosen time a reminder may still go out (covers missed cron runs). */
const REMINDER_WINDOW_MINUTES = 180;

interface ReminderRow {
  id: string;
  timezone: string;
  reminder_minutes: number;
  last_reminded_on: string | null;
  couple_id: string;
  couple_timezone: string;
  include_intimacy: number;
  married: number | null;
  living_together: number | null;
  has_kids: number | null;
  partner_id: string;
  partner_name: string;
}

/**
 * Runs from the cron trigger. Sends each opted-in user one reminder a day, at
 * (or shortly after) their chosen local time, unless they've already answered
 * today's question.
 */
export async function sendDailyReminders(env: AppEnv, now = new Date()): Promise<number> {
  if (!vapidKeys(env)) return 0;
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.timezone, u.reminder_minutes, u.last_reminded_on, u.couple_id,
            c.timezone AS couple_timezone, c.include_intimacy, c.married, c.living_together, c.has_kids,
            p.id AS partner_id, p.name AS partner_name
       FROM users u
       JOIN couples c ON c.id = u.couple_id
       JOIN users p ON p.couple_id = u.couple_id AND p.id <> u.id
      WHERE u.reminder_enabled = 1
        AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id)`,
  ).all<ReminderRow>();

  let sent = 0;
  for (const u of results) {
    const local = zonedNow(u.timezone, now);
    if (u.last_reminded_on === local.day) continue;
    if (local.minutes < u.reminder_minutes || local.minutes >= u.reminder_minutes + REMINDER_WINDOW_MINUTES) continue;

    // Claim today's reminder first so overlapping cron runs can't double-send.
    const claim = await env.DB.prepare(
      'UPDATE users SET last_reminded_on = ?1 WHERE id = ?2 AND (last_reminded_on IS NULL OR last_reminded_on <> ?1)',
    )
      .bind(local.day, u.id)
      .run();
    if (!claim.meta.changes) continue;

    const daily = await getOrAssignDaily(
      env.DB,
      {
        id: u.couple_id,
        timezone: u.couple_timezone,
        include_intimacy: u.include_intimacy,
        married: u.married,
        living_together: u.living_together,
        has_kids: u.has_kids,
      },
      now,
    );
    const question = await findQuestion(env.DB, daily.questionId, u.couple_id);
    if (!question) continue;
    const { results: answered } = await env.DB.prepare('SELECT user_id FROM answers WHERE couple_id = ? AND question_id = ?')
      .bind(u.couple_id, question.id)
      .all<{ user_id: string }>();
    if (answered.some((a) => a.user_id === u.id)) continue;
    const partnerAnswered = answered.some((a) => a.user_id === u.partner_id);

    const payload: PushPayload = {
      title: partnerAnswered ? `${u.partner_name} answered today’s question` : 'Today’s question',
      body: partnerAnswered
        ? `Write yours to read theirs: ${quote(question, u.partner_name)}`
        : quote(question, u.partner_name, 160),
      url: '/today',
      tag: `daily-${daily.day}`,
      badge: await countYourTurn(env.DB, u.couple_id, u.id),
    };
    sent += (await pushToUser(env, u.id, payload, { topic: 'daily', ttl: 6 * 60 * 60 })) > 0 ? 1 : 0;
  }
  return sent;
}

/**
 * Runs from the cron trigger. On the day of a planned date night, both partners get a reminder
 * from 9:00 in the couple's time zone until the date starts (21:00 with no set time). Like the
 * other notifications, it says when, never what.
 */
export async function sendDateReminders(env: AppEnv, now = new Date()): Promise<number> {
  if (!vapidKeys(env)) return 0;
  const utcDay = now.toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.couple_id, d.day, d.start_time, d.planner_id, c.timezone FROM date_nights d
       JOIN couples c ON c.id = d.couple_id
      WHERE d.reminded_on IS NULL AND d.day BETWEEN ?1 AND ?2`,
  )
    .bind(addDays(utcDay, -1), addDays(utcDay, 1))
    .all<{ id: string; couple_id: string; day: string; start_time: string | null; planner_id: string | null; timezone: string }>();

  let sent = 0;
  for (const d of results) {
    const local = zonedNow(d.timezone, now);
    const until = d.start_time ? timeToMinutes(d.start_time)! : 21 * 60;
    if (d.day !== local.day || local.minutes < DATE_REMINDER_MINUTES || local.minutes >= until) continue;
    // Claim it first so overlapping cron runs can't double-send.
    const claim = await env.DB.prepare('UPDATE date_nights SET reminded_on = ?1 WHERE id = ?2 AND reminded_on IS NULL').bind(d.day, d.id).run();
    if (!claim.meta.changes) continue;
    const { results: people } = await env.DB.prepare('SELECT id, name, notify_dates FROM users WHERE couple_id = ?')
      .bind(d.couple_id)
      .all<{ id: string; name: string; notify_dates: number }>();
    for (const person of people) {
      if (person.notify_dates !== 1) continue;
      const partner = people.find((p) => p.id !== person.id);
      const who =
        d.planner_id === null ? 'You’re planning it together.' : d.planner_id === person.id ? 'You’re planning it.' : `${partner?.name ?? 'Your partner'} is planning it.`;
      const evening = d.start_time !== null && until >= 17 * 60;
      const payload: PushPayload = {
        title: evening ? 'Date night tonight' : 'Date night today',
        body: `${d.start_time ? `At ${formatClock(d.start_time)}. ` : ''}${who}`,
        url: '/dates',
        tag: `date-${d.id}`,
      };
      sent += (await pushToUser(env, person.id, payload, { ttl: 12 * 60 * 60 })) > 0 ? 1 : 0;
    }
  }
  return sent;
}

/** Hourly housekeeping: drop expired sessions, invites and rate-limit windows. */
export async function cleanupExpired(env: AppEnv, now = Date.now()): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM invites WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM rate_limits WHERE window_start <= ?').bind(now - 24 * 60 * 60 * 1000),
  ]);
}
