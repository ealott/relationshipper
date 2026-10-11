import { getFlag, setFlag } from './platform';

// Long journal entries shouldn't be lost to a closed tab: drafts live in this browser only.
const key = (userId: string, questionId: string, kind: 'answer' | 'response') => `draft:${userId}:${kind}:${questionId}`;

export const loadDraft = (userId: string, questionId: string, kind: 'answer' | 'response') => getFlag(key(userId, questionId, kind)) ?? '';

export function saveDraft(userId: string, questionId: string, kind: 'answer' | 'response', text: string) {
  setFlag(key(userId, questionId, kind), text.trim() ? text : null);
}

export const clearDraft = (userId: string, questionId: string, kind: 'answer' | 'response') => setFlag(key(userId, questionId, kind), null);
