import type { QuestionDTO, QuestionSource } from '../shared/api';
import type { Audience, CategoryId, Depth } from '../shared/questions/types';

export interface QuestionRow {
  id: string;
  category: string | null;
  text: string;
  depth: number;
  audience: string | null;
  source: QuestionSource;
  status: 'active' | 'retired';
  couple_id: string | null;
  author_id: string | null;
  created_at: number;
  updated_at: number;
}

export function toQuestionDTO(q: QuestionRow): QuestionDTO {
  return {
    id: q.id,
    category: (q.category as CategoryId | null) ?? null,
    text: q.text,
    depth: (Math.min(3, Math.max(1, q.depth)) as Depth) ?? 2,
    audience: (q.audience as Audience | null) ?? null,
    source: q.source,
    authorId: q.source === 'custom' ? q.author_id : null,
    retired: q.status === 'retired',
    createdAt: q.created_at,
  };
}

// The shared bank changes rarely (admin edits); cache it briefly per isolate.
let bankCache: { rows: QuestionRow[]; at: number } | null = null;
const BANK_TTL = 60_000;

/** All shared (non-custom) questions, active and retired. */
export async function getBank(db: D1Database, fresh = false): Promise<QuestionRow[]> {
  if (!fresh && bankCache && Date.now() - bankCache.at < BANK_TTL) return bankCache.rows;
  const { results } = await db.prepare('SELECT * FROM questions WHERE couple_id IS NULL ORDER BY id').all<QuestionRow>();
  bankCache = { rows: results, at: Date.now() };
  return results;
}

export function invalidateBank() {
  bankCache = null;
}

/** A question this couple may see: any shared question, or one of their own. */
export async function findQuestion(db: D1Database, id: string, coupleId: string): Promise<QuestionRow | null> {
  if (id.length > 100) return null;
  return db
    .prepare('SELECT * FROM questions WHERE id = ? AND (couple_id IS NULL OR couple_id = ?)')
    .bind(id, coupleId)
    .first<QuestionRow>();
}

export async function findQuestions(db: D1Database, ids: string[], coupleId: string): Promise<Map<string, QuestionRow>> {
  if (!ids.length) return new Map();
  const { results } = await db
    .prepare('SELECT * FROM questions WHERE id IN (SELECT value FROM json_each(?1)) AND (couple_id IS NULL OR couple_id = ?2)')
    .bind(JSON.stringify(ids), coupleId)
    .all<QuestionRow>();
  return new Map(results.map((q) => [q.id, q]));
}
