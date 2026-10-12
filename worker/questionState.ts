import type { AnswerDTO, QuestionState, ResponseDTO, VersionDTO, VersionsResponse } from '../shared/api';
import { JOURNAL_PREFIX } from '../shared/journal';

export interface AnswerRow {
  question_id: string;
  user_id: string;
  text: string;
  created_at: number;
  updated_at: number;
  edited_at: number | null;
}

export interface ResponseRow {
  id: string;
  question_id: string;
  user_id: string;
  text: string;
  created_at: number;
  edited_at: number | null;
}

const toAnswer = (r: AnswerRow): AnswerDTO => ({ text: r.text, createdAt: r.created_at, updatedAt: r.updated_at, editedAt: r.edited_at });
const toResponse = (r: ResponseRow): ResponseDTO => ({ id: r.id, userId: r.user_id, text: r.text, createdAt: r.created_at, editedAt: r.edited_at });

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
        `SELECT question_id, user_id, text, created_at, updated_at, edited_at FROM answers
          WHERE couple_id = ?1 AND question_id IN (SELECT value FROM json_each(?2))`,
      )
      .bind(coupleId, ids),
    db
      .prepare(
        `SELECT id, question_id, user_id, text, created_at, edited_at FROM responses
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

/**
 * Earlier versions of the answers and replies to these questions, by question id. Like the
 * answers themselves, they're only read for questions both partners have answered.
 */
export async function getVersions(db: D1Database, coupleId: string, states: QuestionState[]): Promise<Map<string, VersionsResponse>> {
  const revealed = states.filter((s) => s.revealedAt !== null).map((s) => s.questionId);
  const out = new Map<string, VersionsResponse>(revealed.map((id) => [id, { answers: {}, responses: {} }]));
  if (!revealed.length) return out;
  const ids = JSON.stringify(revealed);
  type Row = { question_id: string; key: string; text: string; written_at: number; replaced_at: number };
  const [answers, responses] = await db.batch<Row>([
    db
      .prepare(
        `SELECT question_id, user_id AS key, text, written_at, replaced_at FROM answer_versions
          WHERE couple_id = ?1 AND question_id IN (SELECT value FROM json_each(?2)) ORDER BY replaced_at DESC`,
      )
      .bind(coupleId, ids),
    db
      .prepare(
        `SELECT r.question_id, v.response_id AS key, v.text, v.written_at, v.replaced_at
           FROM response_versions v JOIN responses r ON r.id = v.response_id
          WHERE r.couple_id = ?1 AND r.question_id IN (SELECT value FROM json_each(?2)) ORDER BY v.replaced_at DESC`,
      )
      .bind(coupleId, ids),
  ]);
  const add = (rows: Row[], pick: (v: VersionsResponse) => Record<string, VersionDTO[]>) => {
    for (const r of rows) (pick(out.get(r.question_id)!)[r.key] ??= []).push({ text: r.text, writtenAt: r.written_at, replacedAt: r.replaced_at });
  };
  add(answers!.results, (v) => v.answers);
  add(responses!.results, (v) => v.responses);
  return out;
}

/** Questions (not journal days) the partner has answered and the user hasn't. */
export async function countYourTurn(db: D1Database, coupleId: string, userId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM answers p
        WHERE p.couple_id = ?1 AND p.user_id <> ?2 AND p.question_id NOT LIKE ?3
          AND NOT EXISTS (SELECT 1 FROM answers m WHERE m.couple_id = p.couple_id AND m.question_id = p.question_id AND m.user_id = ?2)`,
    )
    .bind(coupleId, userId, `${JOURNAL_PREFIX}%`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
