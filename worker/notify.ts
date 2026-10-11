import { questionText } from '../shared/categories';
import type { AppEnv } from './env';
import { sendPush, type PushTarget, type SendOptions, type VapidKeys } from './push/webpush';
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

export type ActivityKind = 'answered-daily' | 'answered' | 'revealed' | 'responded' | 'wrote-question';

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

  const q = quote(question, from.name);
  const copy: Record<ActivityKind, { title: string; body: string }> = {
    'answered-daily': { title: `${from.name} answered today’s question`, body: `${q} Write yours to read theirs.` },
    answered: { title: `${from.name} answered a question`, body: `${q} Write yours to read theirs.` },
    revealed: { title: `${from.name} answered too`, body: `Read what you both wrote: ${q}` },
    responded: { title: `${from.name} responded to you`, body: q },
    'wrote-question': { title: `${from.name} wrote a question for you both`, body: q },
  };
  await env.DB.prepare('UPDATE users SET last_activity_push_at = ? WHERE id = ?').bind(now, partnerId).run();
  await pushToUser(env, partnerId, {
    ...copy[kind],
    url: `/q/${question.id}`,
    tag: `q-${question.id}`,
    badge: await countYourTurn(env.DB, coupleId, partnerId),
  });
}
