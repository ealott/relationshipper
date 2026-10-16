// Request/response shapes shared by the Worker and the client.
import type { DateSetting } from './dates';
import type { Audience, CategoryId, Depth } from './questions/types';
import type { MilestoneKind } from './timeline';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  timezone: string;
  reminderEnabled: boolean;
  /** Local time of the daily reminder, "HH:MM" in the user's own timezone. */
  reminderTime: string;
  notifyPartner: boolean;
  /** Date night notifications: when your partner plans, moves or cancels one, and a reminder on the day. */
  notifyDates: boolean;
  /** A notification when your partner sends a snuggle. */
  notifySnuggles: boolean;
  /** Boogers (booty calls) are on for you: they're on for everyone unless turned off. */
  bootyCalls: boolean;
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
  /** Paired automatically from the server's two sign-in names, so they can't unpair. */
  permanent: boolean;
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
  /** Name + shared password sign-in for a fixed list of people. */
  password: boolean;
  /** Local development only: sign in without Google. */
  dev: boolean;
}

/** `journal`: a couple's journal day (see shared/journal.ts), never listed with the questions. */
export type QuestionSource = 'research' | 'community' | 'custom' | 'journal';

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
  /** When it was last edited after the reveal; its earlier versions are kept (see VersionsResponse). */
  editedAt: number | null;
}

export interface ResponseDTO {
  id: string;
  userId: string;
  text: string;
  createdAt: number;
  /** When it was last edited; its earlier versions are kept. */
  editedAt: number | null;
}

/** An earlier version of an answer or reply, kept when it was edited after the reveal. */
export interface VersionDTO {
  text: string;
  writtenAt: number;
  replacedAt: number;
}

/** Earlier versions, newest first. Only available once both partners have answered. */
export interface VersionsResponse {
  /** By the answer's author (user id). */
  answers: Record<string, VersionDTO[]>;
  /** By reply id. */
  responses: Record<string, VersionDTO[]>;
}

export type DraftKind = 'answer' | 'response';

/** Something you started writing and haven't sent. Never its text: the question opens it. */
export interface UnfinishedDraft {
  questionId: string;
  kind: DraftKind;
  updatedAt: number;
  /** For a journal day, its date (YYYY-MM-DD). */
  journalDay: string | null;
  /** When it was a daily question, the day it was asked. */
  dailyDay: string | null;
}

export interface UnfinishedResponse {
  /** Newest first, from the last two weeks. */
  drafts: UnfinishedDraft[];
}

export interface SnugglesResponse {
  /** Snuggles from your partner you haven't seen yet. */
  unseen: number;
  lastReceivedAt: number | null;
  lastSentAt: number | null;
}

export interface DateIdeaDTO {
  id: string;
  title: string;
  notes: string;
  /** null when it could be either. */
  setting: DateSetting | null;
  authorId: string | null;
  createdAt: number;
}

export interface DateNightDTO {
  id: string;
  /** YYYY-MM-DD in the couple's time zone. */
  day: string;
  /** HH:MM in the couple's time zone, or null for no set time. */
  time: string | null;
  title: string;
  notes: string;
  ideaId: string | null;
  /** Who's planning it; null when you're planning it together. */
  plannerId: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DatesResponse {
  /** Today in the couple's time zone; upcoming dates are on or after it. */
  today: string;
  upcoming: DateNightDTO[];
  /** The most recent past dates, newest first. */
  past: DateNightDTO[];
  ideas: DateIdeaDTO[];
}

export type BootyCallAnswer = 'yes' | 'later' | 'no';

export interface BootyCallDTO {
  id: string;
  fromMe: boolean;
  createdAt: number;
  /** 'later' is a rain check, 'no' is not tonight. */
  answer: BootyCallAnswer | null;
  answeredAt: number | null;
}

export interface BootyCallsResponse {
  /** Whether each of you has boogers (booty calls) on. The button shows while you both do. */
  mine: boolean;
  partner: boolean;
  /** The latest ask from the last 12 hours, either way, unless it was taken back. */
  latest: BootyCallDTO | null;
  canAsk: boolean;
}

/** Your private calendar feed of date nights, for Google Calendar or Apple Calendar. */
export interface CalendarFeedResponse {
  /** The link a calendar app subscribes to; null when it's off. */
  url: string | null;
  /** When a calendar app last fetched it. */
  fetchedAt: number | null;
}

/** One partner's memory of a milestone. */
export interface MemoryDTO {
  userId: string;
  text: string;
  /** The song that goes with it. */
  song: { title: string; artist: string; url: string } | null;
  updatedAt: number;
}

export interface MilestoneDTO {
  id: string;
  kind: MilestoneKind;
  title: string;
  /** YYYY, YYYY-MM or YYYY-MM-DD. */
  day: string;
  place: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  /** Yours and your partner's, if written. */
  memories: MemoryDTO[];
}

export interface TimelineResponse {
  /** Today in the couple's time zone. */
  today: string;
  /** Oldest first. */
  milestones: MilestoneDTO[];
}

/** What you send to add or change a milestone. */
export interface MilestoneInput {
  kind: MilestoneKind;
  title: string;
  day: string;
  place: string;
}

/** What you send to write your memory of a milestone. All empty removes it. */
export interface MemoryInput {
  text: string;
  songTitle: string;
  songArtist: string;
  songUrl: string;
}

/** One day of the couple's journal. Each partner's entry is the answer to `questionId` (JSON, see shared/journal.ts). */
export interface JournalDay {
  /** YYYY-MM-DD, in the couple's time zone. */
  day: string;
  /** Sundays ask for a longer look back at the week. */
  weekly: boolean;
  questionId: string;
  state: QuestionState;
}

export interface JournalResponse {
  /** Today in the couple's time zone. */
  today: string;
  /** Days either of you has written about, newest first. */
  days: JournalDay[];
  /** Pass as `before` to load older days. */
  nextCursor: string | null;
}

/** An unsent draft. Only ever returned to its author. */
export interface DraftDTO {
  text: string;
  updatedAt: number;
}

export interface DraftsResponse {
  answer: DraftDTO | null;
  response: DraftDTO | null;
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
  journalEntries: number;
  dateNights: number;
  dateIdeas: number;
  milestones: number;
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

/** A nightly (or on-demand) backup: metadata only, never contents. */
export interface AdminBackup {
  key: string;
  createdAt: number;
  bytes: number;
  rows: number;
}

export interface AdminBackupsResponse {
  backups: AdminBackup[];
  /** Days each backup is kept. */
  keepDays: number;
}
