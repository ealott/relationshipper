import type {
  AdminBackup,
  AdminBackupsResponse,
  AdminQuestion,
  AdminStats,
  AdminSuggestion,
  AdminUser,
  AuthConfigResponse,
  BootyCallReaction,
  BootyCallsResponse,
  CalendarFeedResponse,
  BankResponse,
  CustomQuestionsResponse,
  DateIdeaDTO,
  DateNightDTO,
  DatesResponse,
  DraftDTO,
  DraftKind,
  DraftsResponse,
  HistoryResponse,
  InvitePreviewResponse,
  InviteResponse,
  JournalDay,
  JournalResponse,
  MemoryInput,
  MeResponse,
  Instrument,
  LifeChapterDTO,
  LifeNoteDTO,
  MilestoneDTO,
  MilestoneInput,
  ProgressResponse,
  QuestionDTO,
  QuestionResponse,
  QuestionState,
  QuestionnairesResponse,
  SelfProfileDTO,
  SelfResponse,
  SelfResultDTO,
  SnugglesResponse,
  TimelineResponse,
  TodayResponse,
  UnfinishedResponse,
  VersionsResponse,
} from '../shared/api';
import type { DateSetting } from '../shared/dates';
import type { JournalEntry } from '../shared/journal';
import type { Audience, CategoryId, Depth } from '../shared/questions/types';

/** What you send to plan or change a date night. `plannerId` null means you're planning it together. */
export interface DatePlan {
  day: string;
  time: string | null;
  title: string;
  notes: string;
  plannerId: string | null;
  ideaId?: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', 'You seem to be offline. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('app:unauthorized'));
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Something went wrong. Please try again.');
  }
  return data as T;
}

const enc = encodeURIComponent;

/** Full-page navigation into Google sign-in; comes back to `returnTo`. */
export function googleSignInUrl(returnTo = '/') {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `/api/auth/google?returnTo=${enc(returnTo)}&tz=${enc(tz)}`;
}

export function devSignInUrl(email: string, name: string, returnTo = '/') {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `/api/auth/dev?email=${enc(email)}&name=${enc(name)}&returnTo=${enc(returnTo)}&tz=${enc(tz)}`;
}

export interface AdminQuestionInput {
  category?: CategoryId;
  text?: string;
  depth?: Depth;
  audience?: Audience | null;
  status?: 'active' | 'retired';
}

export const api = {
  authConfig: () => request<AuthConfigResponse>('GET', '/auth/config'),
  signIn: (name: string, password: string) =>
    request<MeResponse>('POST', '/auth/password', { name, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  me: () => request<MeResponse>('GET', '/me'),
  logout: () => request<void>('POST', '/auth/logout', {}),
  updateMe: (body: Partial<{ name: string; timezone: string; reminderEnabled: boolean; reminderTime: string; notifyPartner: boolean; notifyDates: boolean; notifySnuggles: boolean; bootyCalls: boolean }>) =>
    request<MeResponse>('PATCH', '/me', body),
  deleteAccount: () => request<void>('POST', '/me/delete', { confirm: 'DELETE' }),

  createInvite: () => request<InviteResponse>('POST', '/invite', {}),
  previewInvite: (code: string) => request<InvitePreviewResponse>('GET', `/invite/${enc(code)}`),
  pair: (code: string) => request<MeResponse>('POST', '/pair', { code }),
  updateCouple: (body: Partial<{ timezone: string; includeIntimacy: boolean; married: boolean; livingTogether: boolean; hasKids: boolean }>) =>
    request<MeResponse>('PATCH', '/couple', body),
  unpair: () => request<MeResponse>('POST', '/couple/unpair', {}),

  bank: () => request<BankResponse>('GET', '/bank'),
  customQuestions: () => request<CustomQuestionsResponse>('GET', '/custom-questions'),
  createQuestion: (body: { text: string; category: CategoryId | null; suggest: boolean }) =>
    request<QuestionDTO>('POST', '/custom-questions', body),
  deleteQuestion: (id: string) => request<void>('DELETE', `/custom-questions/${enc(id)}`),

  today: () => request<TodayResponse>('GET', '/today'),
  progress: () => request<ProgressResponse>('GET', '/progress'),
  history: (before?: number) => request<HistoryResponse>('GET', `/history${before ? `?before=${before}` : ''}`),
  question: (id: string) => request<QuestionResponse>('GET', `/questions/${enc(id)}`),
  answer: (id: string, text: string) => request<QuestionState>('PUT', `/questions/${enc(id)}/answer`, { text }),
  respond: (id: string, text: string) => request<QuestionState>('POST', `/questions/${enc(id)}/responses`, { text }),
  editReply: (id: string, responseId: string, text: string) =>
    request<QuestionState>('PATCH', `/questions/${enc(id)}/responses/${enc(responseId)}`, { text }),
  versions: (id: string) => request<VersionsResponse>('GET', `/questions/${enc(id)}/versions`),
  drafts: (id: string) => request<DraftsResponse>('GET', `/questions/${enc(id)}/drafts`),
  /** `keepalive` lets the save finish even if the page is closing. */
  saveDraft: (id: string, kind: DraftKind, text: string, keepalive = false) =>
    request<DraftDTO | undefined>('PUT', `/questions/${enc(id)}/drafts/${kind}`, { text }, { keepalive }),
  nudge: () => request<{ delivered: boolean }>('POST', '/nudge', {}),
  /** What you've started writing and not sent: which question, never the text. */
  unfinished: () => request<UnfinishedResponse>('GET', '/drafts'),

  journal: (before?: string) => request<JournalResponse>('GET', `/journal${before ? `?before=${before}` : ''}`),
  /** `day` is YYYY-MM-DD or `today`. Opening a day creates it, so drafts and replies can belong to it. */
  journalDay: (day: string) => request<JournalDay>('GET', `/journal/${enc(day)}`),
  writeJournal: (day: string, entry: JournalEntry) => request<JournalDay>('PUT', `/journal/${enc(day)}`, entry),

  dates: () => request<DatesResponse>('GET', '/dates'),
  planDate: (date: DatePlan) => request<DateNightDTO>('POST', '/dates', date),
  updateDate: (id: string, date: Partial<DatePlan>) => request<DateNightDTO>('PATCH', `/dates/${enc(id)}`, date),
  cancelDate: (id: string) => request<void>('DELETE', `/dates/${enc(id)}`),
  /** A one-event calendar file for the date, to open on your phone. */
  dateCalendarUrl: (id: string) => `/api/dates/${enc(id)}/calendar.ics`,
  /** Your private calendar feed: off (null), on, or a new link. */
  calendarFeed: () => request<CalendarFeedResponse>('GET', '/calendar'),
  startCalendarFeed: () => request<CalendarFeedResponse>('POST', '/calendar', {}),
  stopCalendarFeed: () => request<void>('DELETE', '/calendar'),
  addDateIdea: (idea: { title: string; notes?: string; setting?: DateSetting | null }) => request<DateIdeaDTO>('POST', '/date-ideas', idea),
  deleteDateIdea: (id: string) => request<void>('DELETE', `/date-ideas/${enc(id)}`),

  timeline: () => request<TimelineResponse>('GET', '/timeline'),
  milestone: (id: string) => request<MilestoneDTO>('GET', `/timeline/${enc(id)}`),
  addMilestone: (milestone: MilestoneInput) => request<MilestoneDTO>('POST', '/timeline', milestone),
  updateMilestone: (id: string, milestone: Partial<MilestoneInput>) => request<MilestoneDTO>('PATCH', `/timeline/${enc(id)}`, milestone),
  removeMilestone: (id: string) => request<void>('DELETE', `/timeline/${enc(id)}`),
  /** Self: private to you. */
  self: () => request<SelfResponse>('GET', '/self'),
  saveSelfProfile: (profile: SelfProfileDTO) => request<SelfProfileDTO>('PUT', '/self/profile', profile),
  addChapter: (chapter: Omit<LifeChapterDTO, 'id'>) => request<LifeChapterDTO>('POST', '/self/chapters', chapter),
  updateChapter: (id: string, chapter: Omit<LifeChapterDTO, 'id'>) => request<LifeChapterDTO>('PATCH', `/self/chapters/${enc(id)}`, chapter),
  removeChapter: (id: string) => request<void>('DELETE', `/self/chapters/${enc(id)}`),
  addLifeNote: (note: Omit<LifeNoteDTO, 'id'>) => request<LifeNoteDTO>('POST', '/self/notes', note),
  updateLifeNote: (id: string, note: Omit<LifeNoteDTO, 'id'>) => request<LifeNoteDTO>('PATCH', `/self/notes/${enc(id)}`, note),
  removeLifeNote: (id: string) => request<void>('DELETE', `/self/notes/${enc(id)}`),
  questionnaires: () => request<QuestionnairesResponse>('GET', '/self/questionnaires'),
  submitQuestionnaire: (instrument: Instrument, answers: number[]) => request<SelfResultDTO>('POST', `/self/questionnaires/${instrument}`, { answers }),
  removeResult: (id: string) => request<void>('DELETE', `/self/questionnaires/results/${enc(id)}`),
  shareQuestionnaire: (instrument: Instrument, shared: boolean) => request<void>('PUT', `/self/questionnaires/${instrument}/share`, { shared }),
  /** Your own memory of it; all empty removes it. */
  writeMemory: (id: string, memory: MemoryInput) => request<MilestoneDTO>('PUT', `/timeline/${enc(id)}/memory`, memory),

  bootyCalls: () => request<BootyCallsResponse>('GET', '/booty-calls'),
  askBootyCall: () => request<BootyCallsResponse>('POST', '/booty-calls', {}),
  answerBootyCall: (id: string, reaction: BootyCallReaction) => request<BootyCallsResponse>('POST', `/booty-calls/${enc(id)}/answer`, { reaction }),
  /** Before it's answered. */
  takeBackBootyCall: (id: string) => request<BootyCallsResponse>('DELETE', `/booty-calls/${enc(id)}`),

  snuggles: () => request<SnugglesResponse>('GET', '/snuggles'),
  /** Also marks your partner's snuggles as seen: snuggling back means you saw them. */
  sendSnuggle: () => request<void>('POST', '/snuggles', {}),
  seenSnuggles: () => request<void>('POST', '/snuggles/seen', {}),

  pushSubscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) => request<void>('POST', '/push/subscribe', sub),
  pushUnsubscribe: (endpoint: string) => request<void>('POST', '/push/unsubscribe', { endpoint }),
  pushTest: () => request<{ delivered: number }>('POST', '/push/test', {}),

  admin: {
    stats: () => request<AdminStats>('GET', '/admin/stats'),
    questions: () => request<{ questions: AdminQuestion[] }>('GET', '/admin/questions'),
    createQuestion: (body: AdminQuestionInput) => request<{ id: string }>('POST', '/admin/questions', body),
    updateQuestion: (id: string, body: AdminQuestionInput) => request<void>('PATCH', `/admin/questions/${enc(id)}`, body),
    suggestions: (status = 'pending') => request<{ suggestions: AdminSuggestion[] }>('GET', `/admin/suggestions?status=${enc(status)}`),
    approve: (id: string, body: AdminQuestionInput) => request<{ id: string }>('POST', `/admin/suggestions/${enc(id)}/approve`, body),
    reject: (id: string) => request<void>('POST', `/admin/suggestions/${enc(id)}/reject`, {}),
    users: (q = '') => request<{ users: AdminUser[] }>('GET', `/admin/users?q=${enc(q)}`),
    deleteUser: (id: string) => request<void>('DELETE', `/admin/users/${enc(id)}`),
    backups: () => request<AdminBackupsResponse>('GET', '/admin/backups'),
    backUpNow: () => request<AdminBackup>('POST', '/admin/backups', {}),
  },
};

/** Downloads the couple's journal as a file (see worker/export.ts). */
export const JOURNAL_EXPORT_URL = '/api/export';
