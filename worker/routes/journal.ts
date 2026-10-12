import { Hono } from 'hono';
import type { JournalDay, JournalResponse } from '../../shared/api';
import { isDay, isWeeklyDay, normalizeEntry, serializeEntry } from '../../shared/journal';
import { saveAnswer } from '../answers';
import type { HonoEnv } from '../env';
import { badRequest, readJson } from '../http';
import { checkDay, getJournalDays, journalQuestion, journalToday, listJournalDays } from '../journal';
import { notifyPartner } from '../notify';
import { getQuestionState } from '../questionState';
import { requireCouple } from '../session';

// The couples journal (see shared/journal.ts). Replies, earlier versions and drafts for a day
// go through the question routes with the day's `questionId`.
export const journalRoutes = new Hono<HonoEnv>()
  .get('/', async (c) => {
    const { user, couple } = requireCouple(c);
    const today = journalToday(couple);
    const before = c.req.query('before') ?? '9999-12-31';
    if (!isDay(before)) throw badRequest('before must be a date.');
    const limit = Math.min(30, Math.max(1, Number(c.req.query('limit') ?? 14) || 14));
    const days = await listJournalDays(c.env.DB, couple.id, before, limit + 1);
    const page = days.slice(0, limit);
    return c.json<JournalResponse>({
      today,
      days: await getJournalDays(c.env.DB, couple.id, user.id, page),
      nextCursor: days.length > limit ? page[page.length - 1]! : null,
    });
  })

  .get('/:day', async (c) => {
    const { user, couple } = requireCouple(c);
    const day = checkDay(couple, c.req.param('day'));
    // Created on opening, so drafts and replies have a question to belong to.
    const q = await journalQuestion(c.env.DB, couple.id, day);
    return c.json<JournalDay>({ day, weekly: isWeeklyDay(day), questionId: q.id, state: await getQuestionState(c.env.DB, couple.id, user.id, q.id) });
  })

  .put('/:day', async (c) => {
    const { user, partner, couple } = requireCouple(c);
    const day = checkDay(couple, c.req.param('day'));
    const entry = normalizeEntry(await readJson(c));
    if ('error' in entry) throw badRequest(entry.error);
    const q = await journalQuestion(c.env.DB, couple.id, day);
    const { first } = await saveAnswer(c.env.DB, { coupleId: couple.id, questionId: q.id, userId: user.id, text: serializeEntry(entry), now: Date.now() });
    const state = await getQuestionState(c.env.DB, couple.id, user.id, q.id);
    if (first) {
      c.executionCtx.waitUntil(
        notifyPartner(c.env, {
          from: { id: user.id, name: user.name },
          partnerId: partner.id,
          coupleId: couple.id,
          kind: state.partnerAnswered ? 'journal-revealed' : 'journal',
          question: q,
        }).catch((err) => console.error('notify failed', err)),
      );
    }
    return c.json<JournalDay>({ day, weekly: isWeeklyDay(day), questionId: q.id, state });
  });
