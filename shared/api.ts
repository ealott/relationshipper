// Request/response shapes shared by the Worker and the client.
import type { Audience, CategoryId, Depth } from './questions/types';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  timezone: string;
  reminderEnabled: boolean;
  /** Local time of the daily reminder, "HH:MM" in the user's own timezone. */
  reminderTime: string;
  notifyPartner: boolean;
  isAdmin: boolean;
}

export interface PartnerDTO {
  id: string;
  name: string;
}

/** null = not answered yet. */
export interface CoupleStage {
  married: boolean | null;
  livingTogether: boolean | null;
  hasKids: boolean | null;
}

export interface CoupleDTO extends CoupleStage {
  id: string;
  /** The daily question rolls over at midnight in this timezone. */
  timezone: string;
  includeIntimacy: boolean;
  createdAt: number;
}

export interface MeResponse {
  user: UserDTO;
  partner: PartnerDTO | null;
  couple: CoupleDTO | null;
  /** Null when the server has no Web Push keys configured. */
  vapidPublicKey: string | null;
}

export interface AuthConfigResponse {
  google: boolean;
  /** Local development only: sign in without Google. */
  dev: boolean;
}

export type QuestionSource = 'research' | 'community' | 'custom';

export interface QuestionDTO {
  id: string;
  /** Null for a couple's own uncategorized questions. */
  category: CategoryId | null;
  text: string;
  depth: Depth;
  audience: Audience | null;
  source: QuestionSource;
  /** For custom questions: which partner wrote it. */
  authorId: string | null;
  /** Retired questions stay readable in history but aren't offered anymore. */
  retired: boolean;
  createdAt: number;
}

export interface BankResponse {
  questions: QuestionDTO[];
}

export interface CustomQuestionsResponse {
  questions: QuestionDTO[];
}

export interface AnswerDTO {
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface ResponseDTO {
  id: string;
  userId: string;
  text: string;
  createdAt: number;
}

export interface QuestionState {
  questionId: string;
  mine: AnswerDTO | null;
  partnerAnswered: boolean;
  /** Only present once both partners have answered. */
  partner: AnswerDTO | null;
  revealedAt: number | null;
  /** The written conversation after the reveal (empty until then). */
  responses: ResponseDTO[];
}

export interface QuestionResponse {
  question: QuestionDTO;
  state: QuestionState;
}

export interface TodayResponse {
  day: string;
  question: QuestionDTO;
  state: QuestionState;
  /** Consecutive days on which you both answered the daily question. */
  streak: number;
}

/** Answer progress per question, without any answer content. */
export type Progress = Record<string, 'mine' | 'partner' | 'both'>;

export interface ProgressResponse {
  progress: Progress;
}

export interface HistoryItem {
  question: QuestionDTO;
  state: QuestionState;
}

export interface HistoryResponse {
  items: HistoryItem[];
  /** Pass as `before` to load the next page. */
  nextCursor: number | null;
}

export interface InviteResponse {
  code: string;
  expiresAt: number;
}

export interface InvitePreviewResponse {
  inviterName: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

// ---- Admin ----

export interface AdminStats {
  users: number;
  couples: number;
  activeCouples7d: number;
  answers: number;
  answers7d: number;
  responses: number;
  customQuestions: number;
  pendingSuggestions: number;
  pushDevices: number;
  bank: { active: number; retired: number };
}

export interface AdminQuestion extends QuestionDTO {
  status: 'active' | 'retired';
  answerCount: number;
  updatedAt: number;
}

export interface AdminSuggestion {
  id: string;
  text: string;
  category: CategoryId | null;
  authorName: string | null;
  status: 'pending' | 'approved' | 'rejected';
  questionId: string | null;
  createdAt: number;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  paired: boolean;
  createdAt: number;
  lastSeenAt: number | null;
}

export const LIMITS = {
  nameMax: 40,
  answerMax: 10_000,
  responseMax: 4_000,
  questionMin: 10,
  questionMax: 300,
} as const;
