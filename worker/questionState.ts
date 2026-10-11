import type { AnswerDTO, QuestionState, ResponseDTO } from '../shared/api';

export interface AnswerRow {
  question_id: string;
  user_id: string;
  text: string;
  created_at: number;
  updated_at: number;
}

export interface ResponseRow {
  id: string;
  question_id: string;
  user_id: string;
  text: string;
  created_at: number;
}

const toAnswer = (r: AnswerRow): AnswerDTO => ({ text: r.text, createdAt: r.created_at, updatedAt: r.updated_at });
const toResponse = (r: ResponseRow): ResponseDTO => ({ id: r.id, userId: r.user_id, text: r.text, createdAt: r.created_at });

/**
 * The only place a partner's answer is turned into a response. It is included
 * strictly when both partners have answered — every endpoint goes through here.
 */
export function buildState(questionId: string, meId: string, answers: AnswerRow[], responses: ResponseRow[]): QuestionState {
  const mine = answers.find((a) => a.question_id === questionId && a.user_id === meId);
  const theirs = answers.find((a) => a.question_id === questionId && a.user_id !== meId);
  const revealed = Boolean(mine && theirs);
  return {
    questionId,
    mine: mine ? toAnswer(mine) : null,
    partnerAnswered: Boolean(theirs),
    partner: revealed ? toAnswer(theirs!) : null,
    revealedAt: revealed ? Math.max(mine!.created_at, theirs!.created_at) : null,
    responses: revealed
      ? responses
          .filter((r) => r.question_id === questionId)
          .sort((a, b) => a.created_at - b.created_at)
          .map(toResponse)
      : [],
  };
}

export async function getQuestionStates(db: D1Database, coupleId: string, meId: string, questionIds: string[]): Promise<QuestionState[]> {
  if (!questionIds.length) return [];
  const ids = JSON.stringify(questionIds);
  const [answers, responses] = await db.batch<AnswerRow | ResponseRow>([
    db
      .prepare(
        `SELECT question_id, user_id, text, created_at, updated_at FROM answers
          WHERE couple_id = ?1 AND question_id IN (SELECT value FROM json_each(?2))`,
      )
      .bind(coupleId, ids),
    db
      .prepare(
        `SELECT id, question_id, user_id, text, created_at FROM responses
          WHERE couple_id = ?1 AND question_id IN (SELECT value FROM json_each(?2))`,
      )
      .bind(coupleId, ids),
  ]);
  return questionIds.map((id) => buildState(id, meId, answers!.results as AnswerRow[], responses!.results as ResponseRow[]));
}

export async function getQuestionState(db: D1Database, coupleId: string, meId: string, questionId: string) {
  const [state] = await getQuestionStates(db, coupleId, meId, [questionId]);
  return state!;
}

/** Questions the partner has answered and the user hasn't. */
export async function countYourTurn(db: D1Database, coupleId: string, userId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM answers p
        WHERE p.couple_id = ?1 AND p.user_id <> ?2
          AND NOT EXISTS (SELECT 1 FROM answers m WHERE m.couple_id = p.couple_id AND m.question_id = p.question_id AND m.user_id = ?2)`,
    )
    .bind(coupleId, userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
