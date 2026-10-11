import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { badRequest, readJson, str } from '../http';
import { fromBase64url } from '../lib/encoding';
import { pushToUser } from '../notify';
import { isAllowedPushEndpoint } from '../push/webpush';
import { requireAuth } from '../session';

const MAX_DEVICES = 10;

function decodedLength(value: unknown): number {
  if (typeof value !== 'string' || value.length > 200) return -1;
  try {
    return fromBase64url(value).length;
  } catch {
    return -1;
  }
}

export const pushRoutes = new Hono<HonoEnv>()
  .post('/subscribe', async (c) => {
    const { user } = requireAuth(c);
    const body = await readJson(c);
    const endpoint = str(body, 'endpoint', { max: 2048, label: 'endpoint' });
    const keys = (body.keys ?? {}) as Record<string, unknown>;
    if (!isAllowedPushEndpoint(endpoint)) throw badRequest('That push service isn’t supported.');
    if (decodedLength(keys.p256dh) !== 65 || decodedLength(keys.auth) !== 16) throw badRequest('Invalid subscription keys.');
    const db = c.env.DB;
    await db.batch([
      db
        .prepare(
          `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (endpoint) DO UPDATE SET
             user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at`,
        )
        .bind(endpoint, user.id, keys.p256dh, keys.auth, Date.now()),
      db
        .prepare(
          `DELETE FROM push_subscriptions WHERE user_id = ?1 AND endpoint NOT IN
             (SELECT endpoint FROM push_subscriptions WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2)`,
        )
        .bind(user.id, MAX_DEVICES),
    ]);
    return c.body(null, 204);
  })
  .post('/unsubscribe', async (c) => {
    const { user } = requireAuth(c);
    const body = await readJson(c);
    const endpoint = str(body, 'endpoint', { max: 2048, label: 'endpoint' });
    await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(endpoint, user.id).run();
    return c.body(null, 204);
  })
  .post('/test', async (c) => {
    const { user } = requireAuth(c);
    const delivered = await pushToUser(c.env, user.id, {
      title: 'Notifications are on ✅',
      body: 'This is how your daily question reminders will look.',
      url: '/settings',
      tag: 'test',
    });
    return c.json({ delivered });
  });
