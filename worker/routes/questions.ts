import { Hono } from 'hono';
import {
  LIMITS,
  type BankResponse,
  type CustomQuestionsResponse,
  type HistoryResponse,
  type Progress,
  type ProgressResponse,
  type QuestionResponse,
  type TodayResponse,
} from '../../shared/api';
import { isCategoryId } from '../../shared/categories';
import { getOrAssignDaily, getStreak } from '../daily';
import type { HonoEnv } from '../env';
import { ApiError, badRequest, readJson } from '../http';
import { randomId } from '../lib/crypto';
import { notifyPartner, pushToUser, quote } from '../notify';
import { findQuestion, findQuestions, getBank, toQuestionDTO, type QuestionRow } from '../questions';
import { countYourTurn, getQuestionState, getQuestionStates } from '../questionState';
import { requireAuth, requireCouple } from '../session';

const NUDGE_COOLDOWN = 3 * 60 * 60 * 1000;
const RESPONSE_BURST_MS = 3 * 60 * 1000;

function writtenText(body: Record<string, unknown>, max: number, what: string): string {
  if (typeof body.text !== 'string') throw badRequest(`Write your ${what} first.`);
  const text = body.text.trim();
  if (!text) throw badRequest(`Write your ${what} first.`);
  if (text.length > max) throw badRequest(`That’s a little long — keep it under ${max.toLocaleString('en-US')} characters.`);
  return text;
}

async function questionFor(db: D1Database, id: string, coupleId: string): Promise<QuestionRow> {
  const q = await findQuestion(db, id, coupleId);
  if (!q) throw new ApiError(404, 'unknown_question', 'That question doesn’t exist.');
  return q;
}

export const questionRoutes = new Hono<HonoEnv>()
  // The shared bank (research-based + approved community questions), for browsing.
  .get('/bank', async (c) => {
    requireAuth(c);
    const rows = await getBank(c.env.DB);
    const etag = `W/"${rows.length}-${Math.max(0, ...rows.map((r) => r.updated_at))}"`;
    c.header('ETag', etag);
    c.header('Cache-Control', 'private, no-cache');
    if (c.req.header('if-none-match') === etag) return c.body(null, 304);
    return c.json<BankResponse>({ questions: rows.map(toQuestionDTO) });
  })

  .get('/today', async (c) => {
    const { user, couple } = requireCouple(c);
    const daily = await getOrAssignDaily(c.env.DB, couple);
    const [question, state, streak] = await Promise.all([
      questionFor(c.env.DB, daily.questionId, couple.id),
      getQuestionState(c.env.DB, couple.id, user.id, daily.questionId),
      getStreak(c.env.DB, couple.id, daily.day),
    ]);
    return c.json<TodayResponse>({ day: daily.day, question: toQuestionDTO(question), state, streak });
  })

  .get('/progress', async (c) => {
    const { user, couple } = requireCouple(c);
    const { results } = await c.env.DB.prepare(
      `SELECT question_id, MAX(user_id = ?2) AS mine, MAX(user_id <> ?2) AS theirs
         FROM answers WHERE couple_id = ?1 GROUP BY question_id`,
    )
      .bind(couple.id, user.id)
      .all<{ question_id: string; mine: number; theirs: number }>();
    const progress: Progress = {};
    for (const r of results) progress[r.question_id] = r.mine && r.theirs ? 'both' : r.mine ? 'mine' : 'partner';
    return c.json<ProgressResponse>({ progress });
  })

  .get('/history', async (c) => {
    const { user, partner, couple } = requireCouple(c);
    const before = Number(c.req.query('before') ?? Number.MAX_SAFE_INTEGER);
    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? 20) || 20));
    if (!Number.isFinite(before)) throw badRequest('before must be a number.');
    // The self-join only yields questions both partners have answered.
    const { results } = await c.env.DB.prepare(
      `SELECT m.question_id, MAX(m.created_at, p.created_at) AS revealed_at
         FROM answers m
         JOIN answers p ON p.couple_id = m.couple_id AND p.question_id = m.question_id AND p.user_id = ?3
        WHERE m.couple_id = ?1 AND m.user_id = ?2 AND MAX(m.created_at, p.created_at) < ?4
        ORDER BY revealed_at DESC
        LIMIT ?5`,
    )
      .bind(couple.id, user.id, partner.id, before, limit + 1)
      .all<{ question_id: string; revealed_at: number }>();
    const page = results.slice(0, limit);
    const ids = page.map((r) => r.question_id);
    const [questions, states] = await Promise.all([
      findQuestions(c.env.DB, ids, couple.id),
      getQuestionStates(c.env.DB, couple.id, user.id, ids),
    ]);
    return c.json<HistoryResponse>({
      items: states.filter((s) => questions.has(s.questionId)).map((state) => ({ question: toQuestionDTO(questions.get(state.questionId)!), state })),
      nextCursor: results.length > limit ? page[page.length - 1]!.revealed_at : null,
    });
  })

  .get('/questions/:id', async (c) => {
    const { user, couple } = requireCouple(c);
    const q = await questionFor(c.env.DB, c.req.param('id'), couple.id);
    return c.json<QuestionResponse>({ question: toQuestionDTO(q), state: await getQuestionState(c.env.DB, couple.id, user.id, q.id) });
  })

  .put('/questions/:id/answer', async (c) => {
    const { user, partner, couple } = requireCouple(c);
    const q = await questionFor(c.env.DB, c.req.param('id'), couple.id);
    const text = writtenText(await readJson(c), LIMITS.answerMax, 'answer');
    const now = Date.now();
    // You can change your answer until your partner answers; after the reveal it's locked.
    const written = await c.env.DB.prepare(
      `INSERT INTO answers (couple_id, question_id, user_id, text, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT (couple_id, question_id, user_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at
       WHERE NOT EXISTS (SELECT 1 FROM answers WHERE couple_id = ?1 AND question_id = ?2 AND user_id <> ?3)
       RETURNING created_at`,
    )
      .bind(couple.id, q.id, user.id, text, now)
      .first<{ created_at: number }>();
    if (!written) throw new ApiError(409, 'answer_locked', 'Answers are locked once you’ve both written yours.');
    const state = await getQuestionState(c.env.DB, couple.id, user.id, q.id);
    if (written.created_at === now) {
      const daily = await getOrAssignDaily(c.env.DB, couple);
      const isDaily = daily.questionId === q.id;
      c.executionCtx.waitUntil(
        notifyPartner(c.env, {
          from: { id: user.id, name: user.name },
          partnerId: partner.id,
          coupleId: couple.id,
          kind: state.partnerAnswered ? 'revealed' : isDaily ? 'answered-daily' : 'answered',
          question: q,
        }).catch((err) => console.error('notify failed', err)),
      );
    }
    return c.json(state);
  })

  // Responding to each other after the reveal.
  .post('/questions/:id/responses', async (c) => {
    const { user, partner, couple } = requireCouple(c);
    const q = await questionFor(c.env.DB, c.req.param('id'), couple.id);
    const text = writtenText(await readJson(c), LIMITS.responseMax, 'response');
    const before = await getQuestionState(c.env.DB, couple.id, user.id, q.id);
    if (before.revealedAt === null) throw new ApiError(409, 'not_revealed', 'You can respond once you’ve both answered.');
    const now = Date.now();
    // Several messages in a row from one person → one notification.
    const burst = await c.env.DB.prepare(
      'SELECT 1 FROM responses WHERE couple_id = ? AND question_id = ? AND user_id = ? AND created_at > ? LIMIT 1',
    )
      .bind(couple.id, q.id, user.id, now - RESPONSE_BURST_MS)
      .first();
    await c.env.DB.prepare('INSERT INTO responses (id, couple_id, question_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(randomId(), couple.id, q.id, user.id, text, now)
      .run();
    if (!burst) {
      c.executionCtx.waitUntil(
        notifyPartner(c.env, {
          from: { id: user.id, name: user.name },
          partnerId: partner.id,
          coupleId: couple.id,
          kind: 'responded',
          question: q,
        }).catch((err) => console.error('notify failed', err)),
      );
    }
    return c.json(await getQuestionState(c.env.DB, couple.id, user.id, q.id));
  })

  // Questions a couple writes for themselves.
  .get('/custom-questions', async (c) => {
    const { couple } = requireCouple(c);
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM questions WHERE couple_id = ? AND status = 'active' ORDER BY created_at DESC`,
    )
      .bind(couple.id)
      .all<QuestionRow>();
    return c.json<CustomQuestionsResponse>({ questions: results.map(toQuestionDTO) });
  })

  .post('/custom-questions', async (c) => {
    const { user, partner, couple } = requireCouple(c);
    const body = await readJson(c);
    if (typeof body.text !== 'string') throw badRequest('Write your question first.');
    const text = body.text.trim().replace(/\s+/g, ' ');
    if (text.length < LIMITS.questionMin) throw badRequest('Make your question a little longer.');
    if (text.length > LIMITS.questionMax) throw badRequest(`Questions can be up to ${LIMITS.questionMax} characters.`);
    if (body.category != null && !isCategoryId(body.category)) throw badRequest('Unknown category.');
    const category = (body.category as string | null | undefined) ?? null;
    const now = Date.now();
    const id = `u-${randomId()}`;
    const statements = [
      c.env.DB.prepare(
        `INSERT INTO questions (id, category, text, depth, audience, source, status, couple_id, author_id, created_at, updated_at)
         VALUES (?, ?, ?, 2, NULL, 'custom', 'active', ?, ?, ?, ?)`,
      ).bind(id, category, text, couple.id, user.id, now, now),
    ];
    if (body.suggest === true) {
      // Only the question's wording is shared with admins — never answers.
      statements.push(
        c.env.DB.prepare('INSERT INTO question_suggestions (id, text, category, author_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(
          randomId(),
          text,
          category,
          user.id,
          now,
        ),
      );
    }
    await c.env.DB.batch(statements);
    const q = (await findQuestion(c.env.DB, id, couple.id))!;
    c.executionCtx.waitUntil(
      notifyPartner(c.env, {
        from: { id: user.id, name: user.name },
        partnerId: partner.id,
        coupleId: couple.id,
        kind: 'wrote-question',
        question: q,
      }).catch((err) => console.error('notify failed', err)),
    );
    return c.json(toQuestionDTO(q), 201);
  })

  .delete('/custom-questions/:id', async (c) => {
    const { user, couple } = requireCouple(c);
    const q = await findQuestion(c.env.DB, c.req.param('id'), couple.id);
    if (!q || q.couple_id !== couple.id) throw new ApiError(404, 'unknown_question', 'That question doesn’t exist.');
    if (q.author_id !== user.id) throw new ApiError(403, 'not_author', 'Only the person who wrote a question can delete it.');
    const answered = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM answers WHERE couple_id = ? AND question_id = ?')
      .bind(couple.id, q.id)
      .first<{ n: number }>();
    if (answered?.n) throw new ApiError(409, 'has_answers', 'This question already has answers, so it can’t be deleted.');
    await c.env.DB.prepare('DELETE FROM questions WHERE id = ? AND couple_id = ?').bind(q.id, couple.id).run();
    return c.body(null, 204);
  })

  .post('/nudge', async (c) => {
    const { user, partner, couple } = requireCouple(c);
    const now = Date.now();
    if (user.last_nudge_at && now - user.last_nudge_at < NUDGE_COOLDOWN) {
      throw new ApiError(429, 'nudge_cooldown', `You nudged ${partner.name} recently — give them a little time.`);
    }
    const daily = await getOrAssignDaily(c.env.DB, couple);
    const state = await getQuestionState(c.env.DB, couple.id, user.id, daily.questionId);
    if (state.partnerAnswered) {
      throw new ApiError(409, 'already_answered', `${partner.name} has already answered today’s question.`);
    }
    const q = await questionFor(c.env.DB, daily.questionId, couple.id);
    const delivered = await pushToUser(c.env, partner.id, {
      title: `${user.name} is thinking of you`,
      body: `Today’s question is waiting: ${quote(q, user.name)}`,
      url: '/today',
      tag: `daily-${daily.day}`,
      badge: await countYourTurn(c.env.DB, couple.id, partner.id),
    });
    if (delivered) await c.env.DB.prepare('UPDATE users SET last_nudge_at = ? WHERE id = ?').bind(now, user.id).run();
    return c.json({ delivered: delivered > 0 });
  });
