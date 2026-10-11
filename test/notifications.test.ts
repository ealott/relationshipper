import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TodayResponse } from '../shared/api';
import { getOrAssignDaily } from '../worker/daily';
import { base64url } from '../worker/lib/encoding';
import { cleanupExpired, sendDailyReminders } from '../worker/reminders';
import { createTestEnv, pairedCouple, signUp } from './helpers/env';
import { decryptPush, generateSubscriptionKeys, type SubscriptionKeys } from './helpers/push';

interface CapturedPush {
  endpoint: string;
  headers: Headers;
  payload: any;
}

const devices = new Map<string, SubscriptionKeys>();
let pushes: CapturedPush[] = [];
let pushStatus = 201;
const realFetch = globalThis.fetch;

let t: Awaited<ReturnType<typeof createTestEnv>>;
let vapidPublicKey = '';

beforeAll(async () => {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair;
  vapidPublicKey = base64url(new Uint8Array((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer));
  const vapidPrivateKey = ((await crypto.subtle.exportKey('jwk', keys.privateKey)) as JsonWebKey).d!;
  t = await createTestEnv({ VAPID_PUBLIC_KEY: vapidPublicKey, VAPID_PRIVATE_KEY: vapidPrivateKey, VAPID_SUBJECT: 'mailto:test@example.com' });

  // Play the push service: capture and decrypt what the Worker sends.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const device = devices.get(url);
    if (!device) return realFetch(input, init);
    const body = new Uint8Array(init!.body as Uint8Array);
    pushes.push({
      endpoint: url,
      headers: new Headers(init!.headers),
      payload: JSON.parse(new TextDecoder().decode(await decryptPush(body, device))),
    });
    return new Response(null, { status: pushStatus });
  }) as typeof fetch;
});

afterEach(async () => {
  // Let background notifications from this test land before resetting.
  await t.ctx.flush();
  pushes = [];
  pushStatus = 201;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await t?.dispose();
});

async function subscribe(client: { post: (path: string, body?: unknown) => Promise<{ status: number }> }) {
  const keys = await generateSubscriptionKeys();
  const endpoint = `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`;
  devices.set(endpoint, keys);
  const res = await client.post('/api/push/subscribe', { endpoint, keys: { p256dh: keys.publicKey, auth: keys.auth } });
  expect(res.status).toBe(204);
  return endpoint;
}

const answerFor = (text = 'An answer') => ({ text });

describe('push subscriptions', () => {
  it('exposes the public key and validates subscriptions', async () => {
    const { client } = await signUp(t.env, t.ctx, 'Pat');
    expect((await client.get('/api/me')).body.vapidPublicKey).toBe(vapidPublicKey);
    const keys = await generateSubscriptionKeys();
    const bad = await client.post('/api/push/subscribe', { endpoint: 'https://example.com/push', keys: { p256dh: keys.publicKey, auth: keys.auth } });
    expect(bad.status).toBe(400);
    const badKeys = await client.post('/api/push/subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'abc', auth: keys.auth } });
    expect(badKeys.status).toBe(400);
  });

  it('sends a test notification to each device', async () => {
    const { client } = await signUp(t.env, t.ctx, 'Pat');
    const endpoint = await subscribe(client);
    const res = await client.post('/api/push/test');
    expect(res.body).toEqual({ delivered: 1 });
    expect(pushes).toHaveLength(1);
    const [push] = pushes;
    expect(push!.endpoint).toBe(endpoint);
    expect(push!.headers.get('content-encoding')).toBe('aes128gcm');
    expect(push!.headers.get('ttl')).toBe('86400');
    expect(push!.headers.get('authorization')).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${vapidPublicKey}$`));
    expect(push!.payload).toMatchObject({ title: 'Notifications are on ✅', url: '/settings' });
  });

  it('removes subscriptions the push service reports as gone', async () => {
    const { client, id } = await signUp(t.env, t.ctx, 'Pat');
    await subscribe(client);
    pushStatus = 410;
    expect((await client.post('/api/push/test')).body).toEqual({ delivered: 0 });
    const left = await t.env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').bind(id).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it('unsubscribes a device', async () => {
    const { client } = await signUp(t.env, t.ctx, 'Pat');
    const endpoint = await subscribe(client);
    expect((await client.post('/api/push/unsubscribe', { endpoint })).status).toBe(204);
    expect((await client.post('/api/push/test')).body).toEqual({ delivered: 0 });
  });
});

describe('partner activity notifications', () => {
  it('tells your partner when you answer, then when answers are revealed', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await subscribe(a.client);
    const bDevice = await subscribe(b.client);
    const q = (await a.client.get<TodayResponse>('/api/today')).body.question.id;

    await a.client.put(`/api/questions/${q}/answer`, answerFor('NOT-IN-PUSH'));
    await t.ctx.flush();
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.endpoint).toBe(bDevice);
    expect(pushes[0]!.payload).toMatchObject({ title: 'Alex answered today’s question', url: `/q/${q}`, tag: `q-${q}`, badge: 1 });
    expect(pushes[0]!.payload.body).toContain('Write yours to read theirs.');
    // Notifications never include what anyone wrote.
    expect(JSON.stringify(pushes[0]!.payload)).not.toContain('NOT-IN-PUSH');

    pushes = [];
    await b.client.put(`/api/questions/${q}/answer`, answerFor('ALSO-PRIVATE'));
    await t.ctx.flush();
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.payload).toMatchObject({ title: 'Sam answered too', url: `/q/${q}`, badge: 0 });
    expect(JSON.stringify(pushes[0]!.payload)).not.toContain('ALSO-PRIVATE');

    pushes = [];
    await b.client.post(`/api/questions/${q}/responses`, { text: 'PRIVATE-RESPONSE' });
    await t.ctx.flush();
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.payload).toMatchObject({ title: 'Sam responded to you', url: `/q/${q}` });
    expect(JSON.stringify(pushes[0]!.payload)).not.toContain('PRIVATE-RESPONSE');

    // A quick follow-up message from the same person doesn't notify again.
    pushes = [];
    await b.client.post(`/api/questions/${q}/responses`, { text: 'and another thing' });
    await t.ctx.flush();
    expect(pushes).toHaveLength(0);
  });

  it('tells your partner when you write a question for you both', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await subscribe(b.client);
    const created = await a.client.post('/api/custom-questions', { text: 'What did this year teach you about us?' });
    await t.ctx.flush();
    expect(pushes[0]!.payload).toMatchObject({ title: 'Alex wrote a question for you both', url: `/q/${created.body.id}` });
    expect(pushes[0]!.payload.body).toContain('What did this year teach you about us?');
  });

  it('doesn’t notify on edits, and throttles a burst of library answers', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await subscribe(b.client);
    const daily = (await a.client.get<TodayResponse>('/api/today')).body.question.id;
    const [q1, q2] = ['love-maps-002', 'appreciation-002'].filter((id) => id !== daily);
    await a.client.put(`/api/questions/${q1}/answer`, { text: 'one' });
    await a.client.put(`/api/questions/${q1}/answer`, { text: 'one, edited' });
    await a.client.put(`/api/questions/${q2}/answer`, { text: 'two' });
    await t.ctx.flush();
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.payload.title).toBe('Alex answered a question');
  });

  it('respects the partner’s notification setting', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await subscribe(b.client);
    await b.client.patch('/api/me', { notifyPartner: false });
    await a.client.put('/api/questions/love-maps-002/answer', { text: 'hi' });
    await t.ctx.flush();
    expect(pushes).toHaveLength(0);
  });

  it('lets you nudge your partner about today’s question, with a cooldown', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    expect((await a.client.post('/api/nudge')).body).toEqual({ delivered: false });
    await subscribe(b.client);
    expect((await a.client.post('/api/nudge')).body).toEqual({ delivered: true });
    expect(pushes[0]!.payload).toMatchObject({ title: 'Alex is thinking of you', url: '/today' });
    expect((await a.client.post('/api/nudge')).status).toBe(429);

    const q = (await b.client.get<TodayResponse>('/api/today')).body.question.id;
    await b.client.put(`/api/questions/${q}/answer`, answerFor());
    await a.client.put(`/api/questions/${q}/answer`, answerFor());
    await t.env.DB.prepare('UPDATE users SET last_nudge_at = NULL').run();
    expect((await b.client.post('/api/nudge')).status).toBe(409);
  });
});

describe('daily reminders (cron)', () => {
  // October 2026: London is UTC+1 (BST), New York UTC-4 (EDT).
  const at = (iso: string) => new Date(iso);

  it('reminds once a day at the chosen local time, unless already answered', async () => {
    const { a, b, coupleId } = await pairedCouple(t.env, t.ctx); // a: New York (couple timezone), b: London
    await subscribe(b.client);
    await b.client.patch('/api/me', { reminderEnabled: true, reminderTime: '20:00' });

    expect(await sendDailyReminders(t.env, at('2026-10-12T18:55:00Z'))).toBe(0); // 19:55 London
    expect(await sendDailyReminders(t.env, at('2026-10-12T19:00:00Z'))).toBe(1); // 20:00 London
    expect(pushes).toHaveLength(1);
    const couple = { id: coupleId, timezone: 'America/New_York', include_intimacy: 0, married: 0, living_together: 0, has_kids: 0 };
    const daily = await getOrAssignDaily(t.env.DB, couple, at('2026-10-12T19:00:00Z'));
    expect(daily.day).toBe('2026-10-12');
    expect(pushes[0]!.payload).toMatchObject({ title: 'Today’s question', url: '/today', tag: 'daily-2026-10-12' });
    expect(pushes[0]!.headers.get('topic')).toBe('daily');
    expect(await sendDailyReminders(t.env, at('2026-10-12T19:05:00Z'))).toBe(0); // already reminded today

    // Next day: Alex has answered, so the reminder says so.
    const next = await getOrAssignDaily(t.env.DB, couple, at('2026-10-13T19:02:00Z'));
    await t.env.DB.prepare(
      'INSERT INTO answers (couple_id, question_id, user_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(coupleId, next.questionId, a.id, 'x', Date.now(), Date.now())
      .run();
    pushes = [];
    expect(await sendDailyReminders(t.env, at('2026-10-13T19:02:00Z'))).toBe(1);
    expect(pushes[0]!.payload.title).toBe('Alex answered today’s question');

    // Day three: Sam already answered → no reminder.
    const third = await getOrAssignDaily(t.env.DB, couple, at('2026-10-14T19:00:00Z'));
    await t.env.DB.prepare(
      'INSERT INTO answers (couple_id, question_id, user_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(coupleId, third.questionId, b.id, 'x', Date.now(), Date.now())
      .run();
    pushes = [];
    expect(await sendDailyReminders(t.env, at('2026-10-14T19:00:00Z'))).toBe(0);
    expect(pushes).toHaveLength(0);
  });

  it('skips reminders that are hours late, and people who turned them off', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    await subscribe(a.client);
    await a.client.patch('/api/me', { reminderEnabled: true, reminderTime: '08:00' });
    expect(await sendDailyReminders(t.env, at('2026-10-20T15:30:00Z'))).toBe(0); // 11:30 New York: > 3h late
    await a.client.patch('/api/me', { reminderEnabled: false });
    expect(await sendDailyReminders(t.env, at('2026-10-21T12:05:00Z'))).toBe(0); // 08:05 New York, but disabled
  });

  it('does nothing without VAPID keys', async () => {
    expect(await sendDailyReminders({ ...t.env, VAPID_PRIVATE_KEY: undefined }, new Date())).toBe(0);
  });

  it('cleans up expired sessions', async () => {
    const { client, id } = await signUp(t.env, t.ctx, 'Old');
    await t.env.DB.prepare('UPDATE sessions SET expires_at = 1 WHERE user_id = ?').bind(id).run();
    await cleanupExpired(t.env);
    const n = await t.env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').bind(id).first<{ n: number }>();
    expect(n?.n).toBe(0);
    expect((await client.get('/api/me')).status).toBe(401);
  });
});
