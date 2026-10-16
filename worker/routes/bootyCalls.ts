import { Hono, type Context } from 'hono';
import type { BootyCallReaction, BootyCallsResponse } from '../../shared/api';
import type { HonoEnv } from '../env';
import { ApiError, badRequest, readJson } from '../http';
import { randomId } from '../lib/crypto';
import { notifyBootyCall } from '../notify';
import { requireCouple, type PairedContext } from '../session';

// Boogers: a goofy poke, answered with a goofy reaction (#56). They started as booty calls (#42),
// hence the name in the code, and were renamed (#46). On for every couple (#48); either partner
// can turn them off, which hides them for both. One at a time: a booger can be sent whenever none
// is waiting for an answer. Nothing is counted, and notifications only ever say "booger".

/** A booger stays open, and shows on Today, for this long. */
export const BOOTY_CALL_WINDOW_MS = 12 * 60 * 60 * 1000;
/** Taking one back and sending again doesn't send a second notification this soon. */
const NOTIFY_GAP_MS = 10 * 60 * 1000;
const REACTIONS: readonly BootyCallReaction[] = ['flick', 'ew', 'bless'];

interface BootyCallRow {
  id: string;
  from_user: string;
  created_at: number;
  reaction: BootyCallReaction | null;
  answered_at: number | null;
}

async function load(c: Context<HonoEnv>, auth: PairedContext, now = Date.now()) {
  const db = c.env.DB;
  const [partner, recent] = await db.batch([
    db.prepare('SELECT booty_calls_off FROM users WHERE id = ?').bind(auth.partner.id),
    db
      .prepare('SELECT id, from_user, created_at, reaction, answered_at FROM booty_calls WHERE couple_id = ? AND created_at > ? AND cancelled_at IS NULL ORDER BY created_at DESC')
      .bind(auth.couple.id, now - BOOTY_CALL_WINDOW_MS),
  ]);
  const rows = recent!.results as unknown as BootyCallRow[];
  const mine = auth.user.booty_calls_off === 0;
  const theirs = (partner!.results[0] as { booty_calls_off: number } | undefined)?.booty_calls_off === 0;
  // One at a time: nothing can be sent while a booger, either way, is waiting for an answer.
  const waiting = rows.some((r) => r.answered_at === null);
  return { mine, theirs, latest: rows[0] ?? null, canAsk: mine && theirs && !waiting };
}

function toResponse(auth: PairedContext, state: Awaited<ReturnType<typeof load>>): BootyCallsResponse {
  const on = state.mine && state.theirs;
  const r = state.latest;
  return {
    mine: state.mine,
    partner: state.theirs,
    latest: on && r ? { id: r.id, fromMe: r.from_user === auth.user.id, createdAt: r.created_at, reaction: r.reaction, answeredAt: r.answered_at } : null,
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
    if (!state.canAsk) throw new ApiError(409, 'waiting', 'One at a time: there’s a booger waiting for an answer.');
    const db = c.env.DB;
    // Taking one back and sending it again right away doesn't notify twice. Otherwise each one
    // waits for an answer before the next, so they can't pile up.
    const takenBack = await db
      .prepare('SELECT MAX(cancelled_at) AS at FROM booty_calls WHERE couple_id = ? AND from_user = ?')
      .bind(auth.couple.id, auth.user.id)
      .first<{ at: number | null }>();
    await db.prepare('INSERT INTO booty_calls (id, couple_id, from_user, created_at) VALUES (?, ?, ?, ?)').bind(randomId(), auth.couple.id, auth.user.id, now).run();
    if (!takenBack?.at || now - takenBack.at >= NOTIFY_GAP_MS) notify(c, auth, 'asked');
    return c.json<BootyCallsResponse>(toResponse(auth, await load(c, auth, now)), 201);
  })

  .post('/:id/answer', async (c) => {
    const auth = requireCouple(c);
    const body = await readJson(c);
    const reaction = body.reaction as BootyCallReaction;
    if (!REACTIONS.includes(reaction)) throw badRequest('Answer with flick, ew or bless.');
    const now = Date.now();
    const state = await load(c, auth, now);
    if (!state.mine || !state.theirs) throw new ApiError(409, 'not_on', 'Boogers are off.');
    const res = await c.env.DB.prepare(
      `UPDATE booty_calls SET reaction = ?, answered_at = ?
        WHERE id = ? AND couple_id = ? AND from_user = ? AND answered_at IS NULL AND cancelled_at IS NULL AND created_at > ?`,
    )
      .bind(reaction, now, c.req.param('id'), auth.couple.id, auth.partner.id, now - BOOTY_CALL_WINDOW_MS)
      .run();
    if (!res.meta.changes) throw new ApiError(404, 'unknown_ask', 'That booger isn’t waiting for an answer any more.');
    notify(c, auth, 'answered');
    return c.json<BootyCallsResponse>(toResponse(auth, await load(c, auth, now)));
  })

  // Taking yours back, before it's answered.
  .delete('/:id', async (c) => {
    const auth = requireCouple(c);
    const res = await c.env.DB.prepare(
      'UPDATE booty_calls SET cancelled_at = ? WHERE id = ? AND couple_id = ? AND from_user = ? AND answered_at IS NULL AND cancelled_at IS NULL',
    )
      .bind(Date.now(), c.req.param('id'), auth.couple.id, auth.user.id)
      .run();
    if (!res.meta.changes) throw new ApiError(404, 'unknown_ask', 'That booger isn’t waiting for an answer any more.');
    return c.json<BootyCallsResponse>(toResponse(auth, await load(c, auth)));
  });
