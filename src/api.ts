import type {
  AdminQuestion,
  AdminStats,
  AdminSuggestion,
  AdminUser,
  AuthConfigResponse,
  BankResponse,
  CustomQuestionsResponse,
  HistoryResponse,
  InvitePreviewResponse,
  InviteResponse,
  MeResponse,
  ProgressResponse,
  QuestionDTO,
  QuestionResponse,
  QuestionState,
  TodayResponse,
} from '../shared/api';
import type { Audience, CategoryId, Depth } from '../shared/questions/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
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
  updateMe: (body: Partial<{ name: string; timezone: string; reminderEnabled: boolean; reminderTime: string; notifyPartner: boolean }>) =>
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
  nudge: () => request<{ delivered: boolean }>('POST', '/nudge', {}),

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
  },
};
