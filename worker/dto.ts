import type { CoupleStage, MeResponse } from '../shared/api';
import { minutesToTime } from '../shared/time';
import type { AppEnv } from './env';
import { isPermanentPair } from './loginUsers';
import type { AuthContext, CoupleRow } from './session';

const flag = (v: number | null): boolean | null => (v === null ? null : v === 1);

export function coupleStage(c: Pick<CoupleRow, 'married' | 'living_together' | 'has_kids'>): CoupleStage {
  return { married: flag(c.married), livingTogether: flag(c.living_together), hasKids: flag(c.has_kids) };
}

export function toMeResponse(auth: AuthContext, env: AppEnv): MeResponse {
  const { user, partner, couple } = auth;
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      timezone: user.timezone,
      reminderEnabled: user.reminder_enabled === 1,
      reminderTime: minutesToTime(user.reminder_minutes),
      notifyPartner: user.notify_partner === 1,
      isAdmin: auth.isAdmin,
    },
    partner: partner ? { id: partner.id, name: partner.name } : null,
    couple: couple
      ? {
          id: couple.id,
          timezone: couple.timezone,
          includeIntimacy: couple.include_intimacy === 1,
          createdAt: couple.created_at,
          permanent: partner ? isPermanentPair(env, [user.email, partner.email]) : false,
          ...coupleStage(couple),
        }
      : null,
    vapidPublicKey: env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : null,
  };
}
