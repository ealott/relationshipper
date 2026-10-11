import { useEffect, useRef, useState } from 'preact/hooks';
import type { DraftKind } from '../../shared/api';
import { api } from '../api';
import { getFlag, setFlag } from './platform';

// Drafts are kept on this device as you type (instant, and works offline) and saved to your
// account a moment later, so they survive a cleared browser and follow you to other devices.
// Only you ever see them; the server deletes its copy when the answer or reply is sent.

const SAVE_DELAY = 1000;

interface Stored {
  text: string;
  at: number;
}

const key = (userId: string, questionId: string, kind: DraftKind) => `draft:${userId}:${kind}:${questionId}`;

function readLocal(userId: string, questionId: string, kind: DraftKind): Stored | null {
  const raw = getFlag(key(userId, questionId, kind));
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<Stored>;
    if (typeof stored.text === 'string' && typeof stored.at === 'number') return stored as Stored;
  } catch {
    // Drafts saved before they were timestamped are plain text.
  }
  return { text: raw, at: 0 };
}

function writeLocal(userId: string, questionId: string, kind: DraftKind, text: string, at: number) {
  setFlag(key(userId, questionId, kind), text.trim() ? JSON.stringify({ text, at }) : null);
}

export interface Draft {
  text: string;
  setText: (text: string) => void;
  /** Call before sending: stops pending saves, so a late save can't bring the draft back. */
  settle: () => Promise<void>;
  /** Call once sent. */
  clear: () => void;
}

/**
 * The text of an answer or reply being written. Pass `initial` when editing something already
 * sent (that isn't a draft), and `staleBefore` (when you last sent a reply) so a reply sent
 * from another device doesn't come back as a draft here.
 */
export function useDraft(
  userId: string,
  questionId: string,
  kind: DraftKind,
  { initial, staleBefore = 0 }: { initial?: string; staleBefore?: number } = {},
): Draft {
  const editing = initial !== undefined;
  const [text, setTextState] = useState(() => {
    if (editing) return initial;
    const local = readLocal(userId, questionId, kind);
    return local && local.at >= staleBefore ? local.text : '';
  });
  const typed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unsaved = useRef<string | null>(null);
  const inflight = useRef<Promise<void>>(Promise.resolve());

  function save(keepalive = false) {
    clearTimeout(timer.current);
    const value = unsaved.current;
    if (value === null) return inflight.current;
    unsaved.current = null;
    inflight.current = inflight.current
      .then(() => api.saveDraft(questionId, kind, value, keepalive))
      .then(
        () => undefined,
        () => {
          // Offline or refused: this device still has it. Try again on the next change.
          unsaved.current ??= value;
        },
      );
    return inflight.current;
  }

  // Use a newer draft from another device, unless you've started typing here. A draft only on
  // this device (written offline, say) goes up to your account.
  useEffect(() => {
    if (editing) {
      writeLocal(userId, questionId, kind, '', 0);
      return;
    }
    let cancelled = false;
    api
      .drafts(questionId)
      .then((drafts) => {
        if (cancelled || typed.current) return;
        const remote = drafts[kind];
        const local = readLocal(userId, questionId, kind);
        if (remote && (!local || remote.updatedAt > local.at)) {
          writeLocal(userId, questionId, kind, remote.text, remote.updatedAt);
          setTextState(remote.text);
        } else if (!remote && local && local.at >= staleBefore) {
          unsaved.current = local.text;
          void save();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [questionId, kind]);

  // Save straight away when the app goes to the background, comes back online, or this closes.
  useEffect(() => {
    if (editing) return;
    const onHide = () => document.visibilityState === 'hidden' && void save(true);
    const onOnline = () => void save();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('online', onOnline);
      void save(true);
    };
  }, [questionId, kind]);

  return {
    text,
    setText(value) {
      typed.current = true;
      setTextState(value);
      if (editing) return;
      writeLocal(userId, questionId, kind, value, Date.now());
      unsaved.current = value;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), SAVE_DELAY);
    },
    settle() {
      clearTimeout(timer.current);
      unsaved.current = null;
      return inflight.current;
    },
    clear() {
      clearTimeout(timer.current);
      unsaved.current = null;
      writeLocal(userId, questionId, kind, '', 0);
      setTextState('');
    },
  };
}
