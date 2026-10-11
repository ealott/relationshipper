import { app } from './app';
import type { AppEnv } from './env';
import { cleanupExpired, sendDailyReminders } from './reminders';

export default {
  fetch: app.fetch,

  async scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime);
    ctx.waitUntil(sendDailyReminders(env, now));
    if (now.getUTCMinutes() < 5) ctx.waitUntil(cleanupExpired(env, now.getTime()));
  },
} satisfies ExportedHandler<AppEnv>;
