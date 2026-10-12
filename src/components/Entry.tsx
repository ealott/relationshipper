import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AnswerDTO, QuestionState, VersionDTO, VersionsResponse } from '../../shared/api';
import { api } from '../api';
import { formatDate } from '../lib/format';
import { toastError } from '../lib/toast';
import { Avatar } from './Avatar';
import { HistoryIcon, PencilIcon } from './Icons';

/** One partner's answer: who wrote it, when, and what. `render` shows structured answers (the journal). */
export function AnswerEntry({
  answer,
  who,
  name,
  onEdit,
  render,
  children,
}: {
  answer: AnswerDTO;
  who: 'me' | 'partner';
  name: string;
  onEdit?: () => void;
  render?: (text: string) => ComponentChildren;
  children?: ComponentChildren;
}) {
  return (
    <section class={`entry entry--${who}`}>
      <header class="entry__head">
        <Avatar name={name} who={who} size={26} />
        <span class="entry__name">{who === 'me' ? 'You' : name}</span>
        <time class="entry__date">{formatDate(answer.updatedAt)}</time>
        {onEdit && (
          <button type="button" class="link-button entry__edit" onClick={onEdit}>
            <PencilIcon size={14} /> Edit
          </button>
        )}
      </header>
      {render ? <div class="entry__body">{render(answer.text)}</div> : <div class="entry__text">{answer.text}</div>}
      {children}
    </section>
  );
}

/**
 * Earlier versions of a question's answers and replies, fetched the first time someone asks to
 * see them, and again after any edit.
 */
export function useVersions(questionId: string, state: QuestionState) {
  const edits = [state.mine?.editedAt, state.partner?.editedAt, ...state.responses.map((r) => r.editedAt)].join();
  const [data, setData] = useState<VersionsResponse | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  useEffect(() => {
    setData(null);
    loading.current = null;
  }, [questionId, edits]);
  function load() {
    loading.current ??= api.versions(questionId).then(setData, (err) => {
      loading.current = null;
      toastError(err);
    });
  }
  return { data, load };
}

/** "Edited …", opening the earlier versions. `versions` is undefined until they've loaded. */
export function EarlierVersions({
  editedAt,
  versions,
  load,
  render,
}: {
  editedAt: number;
  versions: VersionDTO[] | undefined;
  load: () => void;
  render?: (text: string) => ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && !versions) load();
  }, [open, versions]);
  return (
    <div class="versions">
      <button type="button" class="link-button versions__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <HistoryIcon size={14} /> Edited {formatDate(editedAt)} · {open ? 'Hide earlier versions' : 'See what changed'}
      </button>
      {open && <VersionList versions={versions} render={render} />}
    </div>
  );
}

export function VersionList({ versions, render }: { versions: VersionDTO[] | undefined; render?: (text: string) => ComponentChildren }) {
  if (!versions) return <p class="versions__loading">Loading…</p>;
  return (
    <ol class="versions__list" aria-label="Earlier versions">
      {versions.map((v) => (
        <li class="versions__item">
          <time class="versions__date">Written {formatDate(v.writtenAt)}</time>
          {render ? <div class="versions__text">{render(v.text)}</div> : <p class="versions__text">{v.text}</p>}
        </li>
      ))}
    </ol>
  );
}
