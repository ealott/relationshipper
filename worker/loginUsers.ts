import type { AppEnv } from './env';

/** Simple sign-in: a fixed list of names (LOGIN_USERS) sharing one password (LOGIN_PASSWORD). */
export const loginUsers = (env: AppEnv) => (env.LOGIN_USERS ?? '').split(',').map((n) => n.trim()).filter(Boolean);

/**
 * With exactly two sign-in names, those two accounts are paired automatically, for good.
 * Their accounts use the lowercased name in place of an email.
 */
export function isPermanentPair(env: AppEnv, emails: [string, string]): boolean {
  const names = loginUsers(env).map((n) => n.toLowerCase());
  return names.length === 2 && emails[0] !== emails[1] && emails.every((e) => names.includes(e));
}
