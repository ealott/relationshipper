// Admin console API. Admins manage the shared question bank and review suggestions.
// By design there is no endpoint that returns anyone's answers or responses.
import { Hono } from 'hono';
import { LIMITS, type AdminBackup, type AdminBackupsResponse, type AdminQuestion, type AdminStats, type AdminSuggestion, type AdminUser } from '../../shared/api';
import { BACKUP_KEEP_DAYS } from '../../shared/backup';
import { JOURNAL_PREFIX } from '../../shared/journal';
import { isCategoryId } from '../../shared/categories';
import type { Audience } from '../../shared/questions/types';
import { createBackup, listBackups } from '../backup';
import type { HonoEnv } from '../env';
import { ApiError, badRequest, readJson } from '../http';
import { getBank, invalidateBank, toQuestionDTO } from '../questions';
import { requireAdmin } from '../session';
import { deleteUserStatements } from './pairing';

const AUDIENCES: Audience[] = ['unmarried', 'married', 'no-kids', 'parents', 'apart', 'together'];
const DAY = 24 * 60 * 60 * 1000;

interface QuestionFields {
  category: string;
  text: string;
  depth: number;
  audience: Audience | null;
}

/** Validates admin-provided question fields; `partial` allows leaving fields out (for edits). */
function parseQuestionFields(body: Record<string, unknown>, partial: boolean): Partial<QuestionFields> {
  const out: Partial<QuestionFields> = {};
  if (body.category !== undefined || !partial) {
    if (!isCategoryId(body.category)) throw badRequest('Pick a category.');
    out.category = body.category;
  }
  if (body.text !== undefined || !partial) {
    if (typeof body.text !== 'string') throw badRequest('Question text is required.');
    const text = body.text.trim().replace(/\s+/g, ' ');
    if (text.length < LIMITS.questionMin || text.length > LIMITS.questionMax) {
      throw badRequest(`Questions must be ${LIMITS.questionMin}–${LIMITS.questionMax} characters.`);
    }
    out.text = text;
  }
  if (body.depth !== undefined || !partial) {
    const depth = Number(body.depth ?? 2);
    if (![1, 2, 3].includes(depth)) throw badRequest('Depth must be 1, 2 or 3.');
    out.depth = depth;
  }
  if (body.audience !== undefined) {
    if (body.audience !== null && !AUDIENCES.includes(body.audience as Audience)) throw badRequest('Unknown audience.');
    out.audience = (body.audience as Audience | null) ?? null;
  }
  return out;
}

/** Next id in a category, e.g. `kids-036`. */
async function nextQuestionId(db: D1Database, category: string): Promise<string> {
  const { results } = await db.prepare('SELECT id FROM questions WHERE id LIKE ? AND couple_id IS NULL').bind(`${category}-%`).all<{ id: string }>();
  const max = Math.max(0, ...results.map((r) => Number(r.id.slice(category.length + 1)) || 0));
  return `${category}-${String(max + 1).padStart(3, '0')}`;
}

async function insertBankQuestion(db: D1Database, fields: QuestionFields, source: 'research' | 'community', authorId: string | null) {
  const now = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = await nextQuestionId(db, fields.category);
    try {
      await db
        .prepare(
          `INSERT INTO questions (id, category, text, depth, audience, source, status, couple_id, author_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?)`,
        )
        .bind(id, fields.category, fields.text, fields.depth, fields.audience ?? null, source, authorId, now, now)
        .run();
      invalidateBank();
      return id;
    } catch (err) {
      if (!String(err).includes('UNIQUE')) throw err;
    }
  }
  throw new Error('Could not allocate a question id');
}

const count = async (db: D1Database, sql: string, ...binds: unknown[]) =>
  (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;

export const adminRoutes = new Hono<HonoEnv>()
  .use(async (c, next) => {
    requireAdmin(c);
    await next();
  })

  // Backups hold everything, so the console only ever sees their dates and sizes.
  .get('/backups', async (c) => c.json<AdminBackupsResponse>({ backups: await listBackups(c.env), keepDays: BACKUP_KEEP_DAYS }))
  .post('/backups', async (c) => c.json<AdminBackup>(await createBackup(c.env), 201))

  .get('/stats', async (c) => {
    const db = c.env.DB;
    const weekAgo = Date.now() - 7 * DAY;
    const journal = `question_id LIKE '${JOURNAL_PREFIX}%'`;
    const [users, couples, activeCouples7d, answers, answers7d, responses, journalEntries, customQuestions, pendingSuggestions, pushDevices, active, retired] =
      await Promise.all([
        count(db, 'SELECT COUNT(*) AS n FROM users'),
        count(db, 'SELECT COUNT(*) AS n FROM couples'),
        count(db, 'SELECT COUNT(DISTINCT couple_id) AS n FROM answers WHERE created_at > ?', weekAgo),
        count(db, `SELECT COUNT(*) AS n FROM answers WHERE NOT ${journal}`),
        count(db, `SELECT COUNT(*) AS n FROM answers WHERE NOT ${journal} AND created_at > ?`, weekAgo),
        count(db, 'SELECT COUNT(*) AS n FROM responses'),
        count(db, `SELECT COUNT(*) AS n FROM answers WHERE ${journal}`),
        count(db, `SELECT COUNT(*) AS n FROM questions WHERE source = 'custom'`),
        count(db, `SELECT COUNT(*) AS n FROM question_suggestions WHERE status = 'pending'`),
        count(db, 'SELECT COUNT(*) AS n FROM push_subscriptions'),
        count(db, `SELECT COUNT(*) AS n FROM questions WHERE couple_id IS NULL AND status = 'active'`),
        count(db, `SELECT COUNT(*) AS n FROM questions WHERE couple_id IS NULL AND status = 'retired'`),
      ]);
    return c.json<AdminStats>({
      users,
      couples,
      activeCouples7d,
      answers,
      answers7d,
      responses,
      journalEntries,
      customQuestions,
      pendingSuggestions,
      pushDevices,
      bank: { active, retired },
    });
  })

  .get('/questions', async (c) => {
    const rows = await getBank(c.env.DB, true);
    const { results: counts } = await c.env.DB.prepare(
      `SELECT question_id, COUNT(*) AS n FROM answers
        WHERE question_id IN (SELECT id FROM questions WHERE couple_id IS NULL) GROUP BY question_id`,
    ).all<{ question_id: string; n: number }>();
    const answered = new Map(counts.map((r) => [r.question_id, r.n]));
    return c.json<{ questions: AdminQuestion[] }>({
      questions: rows.map((q) => ({ ...toQuestionDTO(q), status: q.status, answerCount: answered.get(q.id) ?? 0, updatedAt: q.updated_at })),
    });
  })

  .post('/questions', async (c) => {
    const fields = parseQuestionFields(await readJson(c), false) as QuestionFields;
    const id = await insertBankQuestion(c.env.DB, fields, 'research', null);
    return c.json({ id }, 201);
  })

  .patch('/questions/:id', async (c) => {
    const body = await readJson(c);
    const fields = parseQuestionFields(body, true);
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of Object.entries(fields)) {
      sets.push(`${column} = ?`);
      values.push(value);
    }
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'retired') throw badRequest('Status must be active or retired.');
      sets.push('status = ?');
      values.push(body.status);
    }
    if (!sets.length) throw badRequest('Nothing to update.');
    const res = await c.env.DB.prepare(`UPDATE questions SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND couple_id IS NULL`)
      .bind(...values, Date.now(), c.req.param('id'))
      .run();
    if (!res.meta.changes) throw new ApiError(404, 'unknown_question', 'No such question.');
    invalidateBank();
    return c.body(null, 204);
  })

  .get('/suggestions', async (c) => {
    const status = c.req.query('status') ?? 'pending';
    const { results } = await c.env.DB.prepare(
      `SELECT s.*, u.name AS author_name FROM question_suggestions s LEFT JOIN users u ON u.id = s.author_id
        WHERE s.status = ? ORDER BY s.created_at DESC LIMIT 200`,
    )
      .bind(status)
      .all<{ id: string; text: string; category: string | null; author_name: string | null; status: AdminSuggestion['status']; question_id: string | null; created_at: number }>();
    return c.json<{ suggestions: AdminSuggestion[] }>({
      suggestions: results.map((s) => ({
        id: s.id,
        text: s.text,
        category: isCategoryId(s.category) ? s.category : null,
        authorName: s.author_name,
        status: s.status,
        questionId: s.question_id,
        createdAt: s.created_at,
      })),
    });
  })

  .post('/suggestions/:id/approve', async (c) => {
    const { user } = requireAdmin(c);
    const suggestion = await c.env.DB.prepare(`SELECT * FROM question_suggestions WHERE id = ? AND status = 'pending'`)
      .bind(c.req.param('id'))
      .first<{ id: string; text: string; category: string | null; author_id: string | null }>();
    if (!suggestion) throw new ApiError(404, 'unknown_suggestion', 'That suggestion was already handled.');
    const body = await readJson(c);
    const fields = parseQuestionFields({ text: suggestion.text, category: suggestion.category, ...body }, false) as QuestionFields;
    const id = await insertBankQuestion(c.env.DB, fields, 'community', suggestion.author_id);
    await c.env.DB.prepare(`UPDATE question_suggestions SET status = 'approved', question_id = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`)
      .bind(id, user.id, Date.now(), suggestion.id)
      .run();
    return c.json({ id }, 201);
  })

  .post('/suggestions/:id/reject', async (c) => {
    const { user } = requireAdmin(c);
    const res = await c.env.DB.prepare(
      `UPDATE question_suggestions SET status = 'rejected', reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'`,
    )
      .bind(user.id, Date.now(), c.req.param('id'))
      .run();
    if (!res.meta.changes) throw new ApiError(404, 'unknown_suggestion', 'That suggestion was already handled.');
    return c.body(null, 204);
  })

  .get('/users', async (c) => {
    const q = (c.req.query('q') ?? '').trim().toLowerCase();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, email, couple_id, created_at, last_seen_at FROM users
        WHERE ?1 = '' OR lower(name) LIKE ?2 OR lower(email) LIKE ?2
        ORDER BY created_at DESC LIMIT 200`,
    )
      .bind(q, `%${q}%`)
      .all<{ id: string; name: string; email: string; couple_id: string | null; created_at: number; last_seen_at: number | null }>();
    return c.json<{ users: AdminUser[] }>({
      users: results.map((u) => ({ id: u.id, name: u.name, email: u.email, paired: u.couple_id !== null, createdAt: u.created_at, lastSeenAt: u.last_seen_at })),
    });
  })

  .delete('/users/:id', async (c) => {
    const { user: admin } = requireAdmin(c);
    const id = c.req.param('id');
    if (id === admin.id) throw badRequest('Use Settings to delete your own account.');
    const target = await c.env.DB.prepare('SELECT id, couple_id FROM users WHERE id = ?').bind(id).first<{ id: string; couple_id: string | null }>();
    if (!target) throw new ApiError(404, 'unknown_user', 'No such user.');
    await c.env.DB.batch(deleteUserStatements(c.env.DB, target.id, target.couple_id));
    return c.body(null, 204);
  });


