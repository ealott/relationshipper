import type { CoupleDTO, Progress, QuestionDTO, UnfinishedDraft } from '../../shared/api';
import { CATEGORIES } from '../../shared/categories';
import type { Audience } from '../../shared/questions/types';
import { api } from '../api';
import { useQuery } from './query';
import { useMe } from './session';

export const useProgress = () => useQuery('progress', api.progress, { refreshInterval: 30_000 });
export const useToday = () => useQuery('today', api.today, { refreshInterval: 20_000 });
/** Everything you've started writing and haven't sent (Today shows the last two weeks'). */
export const useUnfinished = () => useQuery('unfinished', api.unfinished, { refreshInterval: 60_000 });
export const useBank = () => useQuery('bank', api.bank);
export const useCustomQuestions = () => useQuery('custom-questions', api.customQuestions, { refreshInterval: 60_000 });
/** Days either of you has written about (the first page). */
export const useJournal = () => useQuery('journal', () => api.journal(), { refreshInterval: 30_000 });
export const useJournalDay = (day: string) => useQuery(`journal:${day}`, () => api.journalDay(day), { refreshInterval: 20_000 });
export const useDates = () => useQuery('dates', api.dates, { refreshInterval: 60_000 });
export const useSnuggles = () => useQuery('snuggles', api.snuggles, { refreshInterval: 30_000 });
export const useBootyCalls = () => useQuery('booty-calls', api.bootyCalls, { refreshInterval: 30_000 });
export const useTimeline = () => useQuery('timeline', api.timeline, { refreshInterval: 60_000 });
/** Self: yours alone. */
export const useSelf = () => useQuery('self', api.self);
/** Shares its key's prefix with the timeline, so `invalidate('timeline')` refreshes both. */
export const useMilestone = (id: string) => useQuery(`timeline:${id}`, () => api.milestone(id), { refreshInterval: 30_000 });

/** Every question this couple can see: the shared bank plus their own. */
export function useCatalog(): { byId: Map<string, QuestionDTO>; bank: QuestionDTO[]; custom: QuestionDTO[]; loading: boolean } {
  const bank = useBank();
  const custom = useCustomQuestions();
  const all = [...(bank.data?.questions ?? []), ...(custom.data?.questions ?? [])];
  return {
    byId: new Map(all.map((q) => [q.id, q])),
    bank: bank.data?.questions ?? [],
    custom: custom.data?.questions ?? [],
    loading: !bank.data,
  };
}

export interface DraftItem extends UnfinishedDraft {
  /** What it answers or replies to; null for a journal day. */
  question: QuestionDTO | null;
}

/** Your drafts that can be opened here, newest first, for Questions → Drafts and its count. */
export function useDrafts(): { items: DraftItem[]; loading: boolean } {
  const unfinished = useUnfinished();
  const { byId, loading } = useCatalog();
  const items = (unfinished.data?.drafts ?? []).flatMap((d): DraftItem[] => {
    if (d.journalDay) return [{ ...d, question: null }];
    const question = byId.get(d.questionId);
    return question ? [{ ...d, question }] : [];
  });
  return { items, loading: !unfinished.data || loading };
}

export type Status = 'new' | 'your-turn' | 'waiting' | 'revealed';

export function progressStatus(progress: Progress | undefined, id: string): Status {
  switch (progress?.[id]) {
    case 'both':
      return 'revealed';
    case 'mine':
      return 'waiting';
    case 'partner':
      return 'your-turn';
    default:
      return 'new';
  }
}

export const STATUS_LABEL: Record<Status, string> = {
  new: 'Unanswered',
  'your-turn': 'Your turn',
  waiting: 'Waiting',
  revealed: 'Shared',
};

const AUDIENCE_FITS: Record<Audience, (c: CoupleDTO) => boolean> = {
  unmarried: (c) => c.married === false,
  married: (c) => c.married === true,
  'no-kids': (c) => c.hasKids === false,
  parents: (c) => c.hasKids === true,
  apart: (c) => c.livingTogether === false,
  together: (c) => c.livingTogether === true,
};

/** Mirrors the server: active, opted-in categories, matching the couple's stage. */
export function fitsCouple(q: QuestionDTO, couple: CoupleDTO | null): boolean {
  if (q.retired || !couple) return false;
  if (q.category && CATEGORIES.find((c) => c.id === q.category)?.optIn && !couple.includeIntimacy) return false;
  return !q.audience || AUDIENCE_FITS[q.audience](couple);
}

export function useAvailableBank(): QuestionDTO[] {
  const me = useMe();
  const { bank } = useCatalog();
  return bank.filter((q) => fitsCouple(q, me.couple));
}

export function idsWithStatus(progress: Progress | undefined, status: 'partner' | 'mine'): string[] {
  return Object.entries(progress ?? {})
    .filter(([, v]) => v === status)
    .map(([id]) => id);
}

export function randomFresh(questions: QuestionDTO[], progress: Progress | undefined, exclude?: string): QuestionDTO | undefined {
  const fresh = questions.filter((q) => !progress?.[q.id] && q.id !== exclude);
  const pool = fresh.length ? fresh : questions.filter((q) => progress?.[q.id] !== 'both' && q.id !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}
