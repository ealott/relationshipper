import { randomId } from './lib/crypto';

/**
 * Saves a partner's answer. Until the other partner answers, saving again replaces it: they
 * haven't read it. After the reveal, the version they read is kept as an earlier version and
 * the answer is marked edited. The reveal check runs in the same transaction as the write, so
 * an answer arriving meanwhile can't slip between the two. Saving the same words changes
 * nothing. Clears the author's draft. Returns whether this was their first save.
 */
export async function saveAnswer(
  db: D1Database,
  { coupleId, questionId, userId, text, now }: { coupleId: string; questionId: string; userId: string; text: string; now: number },
): Promise<{ first: boolean }> {
  const revealed = 'EXISTS (SELECT 1 FROM answers WHERE couple_id = ?1 AND question_id = ?2 AND user_id <> ?3)';
  const [, upsert] = await db.batch([
    db
      .prepare(
        `INSERT INTO answer_versions (id, couple_id, question_id, user_id, text, written_at, replaced_at)
         SELECT ?5, couple_id, question_id, user_id, text, updated_at, ?6 FROM answers
          WHERE couple_id = ?1 AND question_id = ?2 AND user_id = ?3 AND text <> ?4 AND ${revealed}`,
      )
      .bind(coupleId, questionId, userId, text, randomId(), now),
    db
      .prepare(
        `INSERT INTO answers (couple_id, question_id, user_id, text, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT (couple_id, question_id, user_id) DO UPDATE SET
           text = excluded.text,
           updated_at = CASE WHEN answers.text <> excluded.text THEN excluded.updated_at ELSE answers.updated_at END,
           edited_at = CASE WHEN answers.text <> excluded.text AND ${revealed} THEN excluded.updated_at ELSE answers.edited_at END
         RETURNING created_at`,
      )
      .bind(coupleId, questionId, userId, text, now),
    db.prepare(`DELETE FROM drafts WHERE user_id = ? AND question_id = ? AND kind = 'answer'`).bind(userId, questionId),
  ]);
  const [row] = upsert!.results as { created_at: number }[];
  return { first: row!.created_at === now };
}
