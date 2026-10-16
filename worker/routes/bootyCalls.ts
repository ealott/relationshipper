import { Hono, type Context } from 'hono';
import type { BootyCallAnswer, BootyCallsResponse } from '../../shared/api';
import type { HonoEnv } from '../env';
import { ApiError, badRequest, readJson } from '../http';
import { randomId } from '../lib/crypto';
import { notifyBootyCall } from '../notify';
import { requireCouple, type PairedContext } from '../session';

// Booty calls (#42), called boogers in the app (#46). On for every couple (#48); either partner can
// turn them off, which hides them for both. Answers are yes, a rain check or not tonight, and nothing is counted. Notifications only
// ever say "booger".

/** An ask stays open, and blocks asking again, for this long. */
export const BOOTY_CALL_WINDOW_MS = 12 * 60 * 60 * 1000;
/** Taking an ask back and asking again doesn't send a second notification this soon. */
const NOTIFY_GAP_MS = 10 * 60 * 1000;
const ANSWERS: readonly BootyCallAnswer[] = ['yes', 'later', 'no'];

interface BootyCallRow {
  id: string;
  from_user: string;
  created_at: number;
  answer: BootyCallAnswer | null;
  answered_at: number | null;
}

async function load(c: Context<HonoEnv>, auth: PairedContext, now = Date.now()) {
  const db = c.env.DB;
  const [partner, recent] = await db.batch([
    db.prepare('SELECT booty_calls_off FROM users WHERE id = ?').bind(auth.partner.id),
    db
      .prepare('SELECT id, from_user, created_at, answer, answered_at FROM booty_calls WHERE couple_id = ? AND created_at > ? AND cancelled_at IS NULL ORDER BY created_at DESC')
      .bind(auth.couple.id, now - BOOTY_CALL_WINDOW_MS),
  ]);
  const rows = recent!.results as unknown as BootyCallRow[];
  const mine = auth.user.booty_calls_off === 0;
  const theirs = (partner!.results[0] as { booty_calls_off: number } | undefined)?.booty_calls_off === 0;
  // You can ask unless you already have in this window, or your partner's ask is waiting on you.
  const blocked = rows.some((r) => r.from_user === auth.user.id || r.answer === null);
  return { mine, theirs, latest: rows[0] ?? null, canAsk: mine && theirs && !blocked };
}

function toResponse(auth: PairedContext, state: Awaited<ReturnType<typeof load>>): BootyCallsResponse {
  const on = state.mine && state.theirs;
  const r = state.latest;
  return {
    mine: state.mine,
    partner: state.theirs,
    latest: on && r ? { id: r.id, fromMe: r.from_user === auth.user.id, createdAt: r.created_at, answer: r.answer, answeredAt: r.answered_at } : null,
    canAsk: state.canAsk,
  };
}

function notify(c: Context<HonoEnv>, auth: PairedContext, kind: 'asked' | 'answered') {
  c.executionCtx.waitUntil(
    notifyBootyCall(c.env, { from: auth.user, partnerId: auth.partner.id, coupleId: auth.couple.id, kind }).catch((err) => console.error('notify failed', err)),
  );
}

export const bootyCallRoutes = new Hono<HonoEnv>()
  .get('/', async (c) => {
    const auth = requireCouple(c);
    return c.json<BootyCallsResponse>(toResponse(auth, await load(c, auth)));
  })

  .post('/', async (c) => {
    const auth = requireCouple(c);
    const now = Date.now();
    const state = await load(c, auth, now);
    if (!state.mine || !state.theirs) throw new ApiError(409, 'not_on', 'Boogers are off: one of you has turned them off in Settings.');
    if (!state.canAsk) throw new ApiError(409, 'already_asked', 'There’s already an ask from the last 12 hours.');
    const db = c.env.DB;
    // Counting asks taken back, so asking again right away doesn't notify twice.
    const lastAsk = await db
      .prepare('SELECT MAX(created_at) AS at FROM booty_calls WHERE couple_id = ? AND from_user = ?')
      .bind(auth.couple.id, auth.user.id)
      .first<{ at: number | null }>();
    await db.prepare('INSERT INTO booty_calls (id, couple_id, from_user, created_at) VALUES (?, ?, ?, ?)').bind(randomId(), auth.couple.id, auth.user.id, now).run();
    if (!lastAsk?.at || now - lastAsk.at >= NOTIFY_GAP_MS) notify(c, auth, 'asked');
    return c.json<BootyCallsResponse>(toResponse(auth, await load(c, auth, now)), 201);
  })

  .post('/:id/answer', async (c) => {
    const auth = requireCouple(c);
    const body = await readJson(c);
    const answer = body.answer as BootyCallAnswer;
    if (!ANSWERS.includes(answer)) throw badRequest('Answer yes, later or no.');
    const now = Date.now();
    const state = await load(c, auth, now);
    if (!state.mine || !state.theirs) throw new ApiError(409, 'not_on', 'Boogers are off.');
    const res = await c.env.DB.prepare(
      `UPDATE booty_calls SET answer = ?, answered_at = ?
        WHERE id = ? AND couple_id = ? AND from_user = ? AND answer IS NULL AND cancelled_at IS NULL AND created_at > ?`,
    )
      .bind(answer, now, c.req.param('id'), auth.couple.id, auth.partner.id, now - BOOTY_CALL_WINDOW_MS)
      .run();
    if (!res.meta.changes) throw new ApiError(404, 'unknown_ask', 'That ask isn’t open any more.');
    notify(c, auth, 'answered');
    return c.json<BootyCallsResponse>(toResponse(auth, await load(c, auth, now)));
  })

  // Taking your ask back, before it's answered.
  .delete('/:id', async (c) => {
    const auth = requireCouple(c);
    const res = await c.env.DB.prepare(
      'UPDATE booty_calls SET cancelled_at = ? WHERE id = ? AND couple_id = ? AND from_user = ? AND answer IS NULL AND cancelled_at IS NULL',
    )
      .bind(Date.now(), c.req.param('id'), auth.couple.id, auth.user.id)
      .run();
    if (!res.meta.changes) throw new ApiError(404, 'unknown_ask', 'That ask isn’t open any more.');
    return c.json<BootyCallsResponse>(toResponse(auth, await load(c, auth)));
  });
