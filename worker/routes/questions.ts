import { Hono } from 'hono';
import {
  LIMITS,
  type BankResponse,
  type CustomQuestionsResponse,
  type DraftDTO,
  type DraftKind,
  type DraftsResponse,
  type HistoryResponse,
  type Progress,
  type ProgressResponse,
  type QuestionResponse,
  type TodayResponse,
  type VersionsResponse,
} from '../../shared/api';
import { isCategoryId } from '../../shared/categories';
import { JOURNAL_PREFIX } from '../../shared/journal';
import { zonedNow } from '../../shared/time';
import { saveAnswer } from '../answers';
import { getOrAssignDaily, getStreak } from '../daily';
import type { HonoEnv } from '../env';
import { exportJournal } from '../export';
import { ApiError, badRequest, readJson } from '../http';
import { randomId } from '../lib/crypto';
import { notifyPartner, pushToUser, quote } from '../notify';
import { findQuestion, findQuestions, getBank, toQuestionDTO, type QuestionRow } from '../questions';
import { countYourTurn, getQuestionState, getQuestionStates, getVersions } from '../questionState';
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
         FROM answers WHERE couple_id = ?1 AND question_id NOT LIKE ?3 GROUP BY question_id`,
    )
      .bind(couple.id, user.id, `${JOURNAL_PREFIX}%`)
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
        WHERE m.couple_id = ?1 AND m.user_id = ?2 AND MAX(m.created_at, p.created_at) < ?4 AND m.question_id NOT LIKE ?6
        ORDER BY revealed_at DESC
        LIMIT ?5`,
    )
      .bind(couple.id, user.id, partner.id, before, limit + 1, `${JOURNAL_PREFIX}%`)
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
    if (q.source === 'journal') throw new ApiError(409, 'journal_day', 'Journal entries are written in the journal.');
    const text = writtenText(await readJson(c), LIMITS.answerMax, 'answer');
    const now = Date.now();
    const { first } = await saveAnswer(c.env.DB, { coupleId: couple.id, questionId: q.id, userId: user.id, text, now });
    const state = await getQuestionState(c.env.DB, couple.id, user.id, q.id);
    if (first) {
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
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO responses (id, couple_id, question_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
        randomId(),
        couple.id,
        q.id,
        user.id,
        text,
        now,
      ),
      c.env.DB.prepare(`DELETE FROM drafts WHERE user_id = ? AND question_id = ? AND kind = 'response'`).bind(user.id, q.id),
    ]);
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

  // Editing a reply keeps its earlier version, for both of you to see.
  .patch('/questions/:id/responses/:responseId', async (c) => {
    const { user, couple } = requireCouple(c);
    const q = await questionFor(c.env.DB, c.req.param('id'), couple.id);
    const text = writtenText(await readJson(c), LIMITS.responseMax, 'reply');
    const db = c.env.DB;
    const id = c.req.param('responseId');
    const reply = await db
      .prepare('SELECT user_id FROM responses WHERE id = ? AND couple_id = ? AND question_id = ?')
      .bind(id, couple.id, q.id)
      .first<{ user_id: string }>();
    if (!reply) throw new ApiError(404, 'unknown_response', 'That reply doesn’t exist.');
    if (reply.user_id !== user.id) throw new ApiError(403, 'not_author', 'Only the person who wrote a reply can edit it.');
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          `INSERT INTO response_versions (id, response_id, text, written_at, replaced_at)
           SELECT ?1, id, text, COALESCE(edited_at, created_at), ?2 FROM responses WHERE id = ?3 AND text <> ?4`,
        )
        .bind(randomId(), now, id, text),
      db.prepare('UPDATE responses SET text = ?1, edited_at = ?2 WHERE id = ?3 AND text <> ?1').bind(text, now, id),
    ]);
    return c.json(await getQuestionState(db, couple.id, user.id, q.id));
  })

  // Earlier versions of edited answers and replies, once you've both answered.
  .get('/questions/:id/versions', async (c) => {
    const { user, couple } = requireCouple(c);
    const q = await questionFor(c.env.DB, c.req.param('id'), couple.id);
    const state = await getQuestionState(c.env.DB, couple.id, user.id, q.id);
    if (state.revealedAt === null) throw new ApiError(409, 'not_revealed', 'Earlier versions appear once you’ve both answered.');
    const versions = await getVersions(c.env.DB, couple.id, [state]);
    return c.json<VersionsResponse>(versions.get(q.id)!);
  })

  // Unsent drafts, saved as you write so they survive closed tabs and follow you to other
  // devices. Only ever returned to their author.
  .get('/questions/:id/drafts', async (c) => {
    const { user, couple } = requireCouple(c);
    const q = await questionFor(c.env.DB, c.req.param('id'), couple.id);
    const { results } = await c.env.DB.prepare('SELECT kind, text, updated_at FROM drafts WHERE user_id = ? AND couple_id = ? AND question_id = ?')
      .bind(user.id, couple.id, q.id)
      .all<{ kind: DraftKind; text: string; updated_at: number }>();
    const draft = (kind: DraftKind): DraftDTO | null => {
      const row = results.find((r) => r.kind === kind);
      return row ? { text: row.text, updatedAt: row.updated_at } : null;
    };
    return c.json<DraftsResponse>({ answer: draft('answer'), response: draft('response') });
  })
  .put('/questions/:id/drafts/:kind', async (c) => {
    const { user, couple } = requireCouple(c);
    const kind = c.req.param('kind');
    if (kind !== 'answer' && kind !== 'response') throw badRequest('Unknown kind of draft.');
    const q = await questionFor(c.env.DB, c.req.param('id'), couple.id);
    const body = await readJson(c);
    const text = typeof body.text === 'string' ? body.text : '';
    const max = kind === 'answer' ? LIMITS.answerMax : LIMITS.responseMax;
    if (text.length > max) throw badRequest(`That’s a little long — keep it under ${max.toLocaleString('en-US')} characters.`);
    const db = c.env.DB;
    if (!text.trim()) {
      await db.prepare('DELETE FROM drafts WHERE user_id = ? AND question_id = ? AND kind = ?').bind(user.id, q.id, kind).run();
      return c.body(null, 204);
    }
    if (kind === 'answer') {
      const answered = await db.prepare('SELECT 1 FROM answers WHERE couple_id = ? AND question_id = ? AND user_id = ?').bind(couple.id, q.id, user.id).first();
      if (answered) throw new ApiError(409, 'already_answered', 'You’ve already answered this one.');
    }
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO drafts (couple_id, question_id, user_id, kind, text, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, question_id, kind) DO UPDATE SET couple_id = excluded.couple_id, text = excluded.text, updated_at = excluded.updated_at`,
      )
      .bind(couple.id, q.id, user.id, kind, text, now)
      .run();
    return c.json<DraftDTO>({ text, updatedAt: now });
  })

  // The journal as a file to keep (Settings → Download our journal).
  .get('/export', async (c) => {
    const auth = requireCouple(c);
    const { day } = zonedNow(auth.couple.timezone);
    c.header('Content-Type', 'text/markdown; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="relationshipper-journal-${day}.md"`);
    c.header('Cache-Control', 'no-store');
    return c.body(await exportJournal(c.env.DB, auth));
  })

  // Questions a couple writes for themselves.
  .get('/custom-questions', async (c) => {
    const { couple } = requireCouple(c);
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM questions WHERE couple_id = ? AND source = 'custom' AND status = 'active' ORDER BY created_at DESC`,
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
