import type { AuthContext } from './session';

// Optional settings may be missing locally, whatever `wrangler types` inferred from .dev.vars.
export interface AppEnv
  extends Omit<Env, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'DEV_LOGIN' | 'ADMIN_EMAILS'> {
  /** Web Push (VAPID) public key, base64url. Secret; see `npm run vapid`. */
  VAPID_PUBLIC_KEY?: string;
  /** Web Push (VAPID) private key (base64url `d`). Secret; see `npm run vapid`. */
  VAPID_PRIVATE_KEY?: string;
  /** Google OAuth client (Web application). The secret is a Worker secret. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Comma-separated emails with access to the admin console. */
  ADMIN_EMAILS?: string;
  /** "true" enables password-less test sign-in on localhost (local development only). */
  DEV_LOGIN?: string;
}

export type HonoEnv = {
  Bindings: AppEnv;
  Variables: { auth: AuthContext | null };
};
