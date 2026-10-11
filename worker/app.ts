import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import type { ApiErrorBody } from '../shared/api';
import type { HonoEnv } from './env';
import { ApiError } from './http';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { pairingRoutes } from './routes/pairing';
import { pushRoutes } from './routes/push';
import { questionRoutes } from './routes/questions';
import { sessionMiddleware } from './session';

export const app = new Hono<HonoEnv>().basePath('/api');

app.use(csrf());
app.use(async (c, next) => {
  await next();
  // Private data: never cache, unless a route opted into revalidation.
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});
app.use(sessionMiddleware);

app.route('/auth', authRoutes);
app.route('/me', meRoutes);
app.route('/push', pushRoutes);
app.route('/admin', adminRoutes);
app.route('/', pairingRoutes);
app.route('/', questionRoutes);

app.notFound((c) => c.json<ApiErrorBody>({ error: { code: 'not_found', message: 'Not found.' } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json<ApiErrorBody>({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof HTTPException) {
    // e.g. the CSRF middleware rejecting a cross-site form post
    return c.json<ApiErrorBody>({ error: { code: 'forbidden', message: err.message || 'Request blocked.' } }, err.status);
  }
  console.error(err);
  return c.json<ApiErrorBody>({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, 500);
});
