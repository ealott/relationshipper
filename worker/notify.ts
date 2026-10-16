import { questionText } from '../shared/categories';
import { formatClock } from '../shared/dates';
import { isWeeklyDay, JOURNAL_PREFIX } from '../shared/journal';
import type { AppEnv } from './env';
import { sendPush, type PushTarget, type SendOptions, type VapidKeys } from './push/webpush';
import { dayLabel } from './journal';
import { countYourTurn } from './questionState';

/** What the service worker receives (see src/sw.ts). Never contains answer text. */
export interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other on the device. */
  tag: string;
  /** App icon badge count: questions waiting on this person. */
  badge?: number;
}

export function vapidKeys(env: AppEnv): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || 'mailto:hello@example.com' };
}

export function quote(q: { text: string }, partnerName: string, max = 110): string {
  const text = questionText(q, partnerName);
  return `“${text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text}”`;
}

/** Sends to every device the user has subscribed. Returns how many deliveries the push services accepted. */
export async function pushToUser(env: AppEnv, userId: string, payload: PushPayload, opts?: SendOptions): Promise<number> {
  const vapid = vapidKeys(env);
  if (!vapid) return 0;
  const { results } = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
    .bind(userId)
    .all<PushTarget>();
  const outcomes = await Promise.all(
    results.map(async (target) => {
      try {
        const res = await sendPush(target, payload, vapid, opts);
        if (res.gone) await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(target.endpoint).run();
        else if (!res.ok) console.warn(`push to ${new URL(target.endpoint).host} failed: ${res.status}`);
        return res.ok;
      } catch (err) {
        console.error('push failed', err);
        return false;
      }
    }),
  );
  return outcomes.filter(Boolean).length;
}

export type ActivityKind = 'answered-daily' | 'answered' | 'revealed' | 'responded' | 'wrote-question' | 'journal' | 'journal-revealed';

// Answering a batch of library questions shouldn't buzz the partner's phone for each one.
// (Bursts of responses are handled per thread, where they're posted.)
const THROTTLE_MS: Partial<Record<ActivityKind, number>> = { answered: 15 * 60 * 1000 };

export async function notifyPartner(
  env: AppEnv,
  args: { from: { id: string; name: string }; partnerId: string; coupleId: string; kind: ActivityKind; question: { id: string; text: string } },
): Promise<void> {
  const { from, partnerId, coupleId, kind, question } = args;
  if (!vapidKeys(env)) return;
  const partner = await env.DB.prepare('SELECT notify_partner, last_activity_push_at FROM users WHERE id = ?')
    .bind(partnerId)
    .first<{ notify_partner: number; last_activity_push_at: number | null }>();
  if (!partner || partner.notify_partner !== 1) return;
  const now = Date.now();
  const throttle = THROTTLE_MS[kind];
  if (throttle && partner.last_activity_push_at && now - partner.last_activity_push_at < throttle) return;

  // Journal days live at /journal/<day>; their question text isn't shown.
  const day = question.id.startsWith(JOURNAL_PREFIX) ? question.id.slice(-10) : null;
  const q = day ? `In your journal: ${dayLabel(day)}` : quote(question, from.name);
  const period = day && isWeeklyDay(day) ? 'week' : 'day';
  const copy: Record<ActivityKind, { title: string; body: string }> = {
    'answered-daily': { title: `${from.name} answered today’s question`, body: `${q} Write yours to read theirs.` },
    answered: { title: `${from.name} answered a question`, body: `${q} Write yours to read theirs.` },
    revealed: { title: `${from.name} answered too`, body: `Read what you both wrote: ${q}` },
    responded: { title: `${from.name} responded to you`, body: q },
    'wrote-question': { title: `${from.name} wrote a question for you both`, body: q },
    journal: { title: `${from.name} wrote about their ${period}`, body: `Write about yours to read theirs.` },
    'journal-revealed': { title: `${from.name} wrote about their ${period} too`, body: `Read about each other’s ${period}.` },
  };
  await env.DB.prepare('UPDATE users SET last_activity_push_at = ? WHERE id = ?').bind(now, partnerId).run();
  await pushToUser(env, partnerId, {
    ...copy[kind],
    url: day ? `/journal/${day}` : `/q/${question.id}`,
    tag: day ? `journal-${day}` : `q-${question.id}`,
    badge: await countYourTurn(env.DB, coupleId, partnerId),
  });
}

/** "Friday, October 17 at 7:00 PM": when a date night is. Never what it is, which someone wrote. */
export const dateWhen = (date: { day: string; start_time: string | null }) =>
  `${dayLabel(date.day)}${date.start_time ? ` at ${formatClock(date.start_time)}` : ''}`;

/** Tells your partner you planned, moved or cancelled a date night, if they want date notifications. */
export async function notifyDate(
  env: AppEnv,
  args: { from: { name: string }; partnerId: string; coupleId: string; kind: 'planned' | 'moved' | 'cancelled'; date: { id: string; day: string; start_time: string | null } },
): Promise<void> {
  const { from, partnerId, coupleId, kind, date } = args;
  if (!vapidKeys(env)) return;
  const partner = await env.DB.prepare('SELECT notify_dates FROM users WHERE id = ?').bind(partnerId).first<{ notify_dates: number }>();
  if (partner?.notify_dates !== 1) return;
  const when = dateWhen(date);
  const copy = {
    planned: { title: `${from.name} planned a date night`, body: when },
    moved: { title: `${from.name} moved your date night`, body: `Now ${when}` },
    cancelled: { title: `${from.name} cancelled a date night`, body: when },
  }[kind];
  await pushToUser(env, partnerId, { ...copy, url: '/dates', tag: `date-${date.id}`, badge: await countYourTurn(env.DB, coupleId, partnerId) });
}

/** A snuggle from your partner, if you want to hear about them. */
export async function notifySnuggle(env: AppEnv, { from, partnerId, coupleId }: { from: { name: string }; partnerId: string; coupleId: string }): Promise<void> {
  if (!vapidKeys(env)) return;
  const partner = await env.DB.prepare('SELECT notify_snuggles FROM users WHERE id = ?').bind(partnerId).first<{ notify_snuggles: number }>();
  if (partner?.notify_snuggles !== 1) return;
  await pushToUser(env, partnerId, {
    title: `${from.name} sent you a snuggle`,
    body: 'Thinking of you.',
    url: '/',
    tag: 'snuggle',
    badge: await countYourTurn(env.DB, coupleId, partnerId),
  });
}

/** Tells your partner you added to your timeline: that you did, never what, which someone wrote. */
export async function notifyTimeline(
  env: AppEnv,
  { from, partnerId, coupleId, kind, milestoneId }: { from: { name: string }; partnerId: string; coupleId: string; kind: 'added' | 'memory'; milestoneId: string },
): Promise<void> {
  if (!vapidKeys(env)) return;
  const partner = await env.DB.prepare('SELECT notify_partner FROM users WHERE id = ?').bind(partnerId).first<{ notify_partner: number }>();
  if (partner?.notify_partner !== 1) return;
  const copy =
    kind === 'added'
      ? { title: `${from.name} added a milestone`, body: 'Add your memory of it to your timeline.' }
      : { title: `${from.name} wrote a memory`, body: 'Read it on your timeline.' };
  await pushToUser(env, partnerId, { ...copy, url: `/timeline/${milestoneId}`, tag: `milestone-${milestoneId}`, badge: await countYourTurn(env.DB, coupleId, partnerId) });
}

/**
 * A booger (`booty_calls` in the code, which is how they started), or its answer. A lock screen
 * only ever says "booger"; which answer it was is only in the app.
 */
export async function notifyBootyCall(
  env: AppEnv,
  { from, partnerId, coupleId, kind }: { from: { name: string }; partnerId: string; coupleId: string; kind: 'asked' | 'answered' },
): Promise<void> {
  if (!vapidKeys(env)) return;
  const copy =
    kind === 'asked'
      ? { title: `${from.name} sent you a booger`, body: 'Open Relationshipper to answer.' }
      : { title: `${from.name} answered your booger`, body: 'Open Relationshipper to see.' };
  await pushToUser(env, partnerId, { ...copy, url: '/', tag: 'booger', badge: await countYourTurn(env.DB, coupleId, partnerId) });
}
