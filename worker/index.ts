import { app } from './app';
import type { AppEnv } from './env';
import { ensureDailyBackup } from './backup';
import { cleanupExpired, sendDailyReminders } from './reminders';

export default {
  fetch: app.fetch,

  async scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime);
    ctx.waitUntil(sendDailyReminders(env, now));
    if (now.getUTCMinutes() < 5) {
      ctx.waitUntil(cleanupExpired(env, now.getTime()));
      ctx.waitUntil(ensureDailyBackup(env, now).catch((err) => console.error('backup failed', err)));
    }
  },
} satisfies ExportedHandler<AppEnv>;
