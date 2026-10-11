import { Hono } from 'hono';
import { LIMITS } from '../../shared/api';
import { isValidTimeZone, timeToMinutes, zonedNow } from '../../shared/time';
import { toMeResponse } from '../dto';
import type { HonoEnv } from '../env';
import { badRequest, optionalBool, readJson, str } from '../http';
import { clearSessionCookie, reloadAuth, requireAuth } from '../session';
import { deleteUserStatements } from './pairing';

export const meRoutes = new Hono<HonoEnv>()
  .get('/', (c) => c.json(toMeResponse(requireAuth(c), c.env)))
  .patch('/', async (c) => {
    const { user, sessionId } = requireAuth(c);
    const body = await readJson(c);
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };

    if (body.name !== undefined) set('name', str(body, 'name', { max: LIMITS.nameMax, label: 'Name' }));
    let timezone: string | undefined;
    if (body.timezone !== undefined) {
      if (!isValidTimeZone(body.timezone)) throw badRequest('Unknown timezone.');
      set('timezone', (timezone = body.timezone));
    }
    const reminderEnabled = optionalBool(body, 'reminderEnabled');
    if (reminderEnabled !== undefined) set('reminder_enabled', reminderEnabled ? 1 : 0);
    let reminderMinutes: number | undefined;
    if (body.reminderTime !== undefined) {
      const m = timeToMinutes(body.reminderTime);
      if (m === null) throw badRequest('Reminder time must look like 20:00.');
      set('reminder_minutes', (reminderMinutes = m));
    }
    const notifyPartner = optionalBool(body, 'notifyPartner');
    if (notifyPartner !== undefined) set('notify_partner', notifyPartner ? 1 : 0);

    // A new schedule shouldn't fire immediately for a time that has already passed today.
    if (reminderEnabled || reminderMinutes !== undefined || timezone !== undefined) {
      const local = zonedNow(timezone ?? user.timezone);
      if (local.minutes >= (reminderMinutes ?? user.reminder_minutes)) set('last_reminded_on', local.day);
    }

    if (sets.length) {
      await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...values, user.id)
        .run();
    }
    return c.json(toMeResponse(await reloadAuth(c.env, user.id, sessionId), c.env));
  })
  .post('/delete', async (c) => {
    const { user, couple } = requireAuth(c);
    const body = await readJson(c);
    if (body.confirm !== 'DELETE') throw badRequest('Type DELETE to confirm.');
    await c.env.DB.batch(deleteUserStatements(c.env.DB, user.id, couple?.id ?? null));
    clearSessionCookie(c);
    return c.body(null, 204);
  });
