import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { LIMITS, type AnswerDTO, type QuestionDTO, type QuestionState, type ResponseDTO, type VersionDTO, type VersionsResponse } from '../../shared/api';
import { questionText } from '../../shared/categories';
import { api } from '../api';
import { useDraft } from '../lib/drafts';
import { formatDate, relativeTime, wordCount } from '../lib/format';
import { invalidate } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { Avatar } from './Avatar';
import { AutoTextarea } from './Field';
import { HistoryIcon, LockIcon, PencilIcon, SendIcon } from './Icons';
import { CategoryLabel, SourceBadge } from './QuestionMeta';
import { Raccoon } from './Raccoon';

interface Props {
  question: QuestionDTO;
  state: QuestionState | undefined;
  onChange: (state: QuestionState) => void;
  daily?: boolean;
}

export function QuestionCard({ question, state, onChange, daily }: Props) {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'your partner';
  const [editing, setEditing] = useState(false);
  const revealed = state?.revealedAt != null;

  // Play the reveal animation only when it happens in front of you.
  const seenRevealed = useRef(revealed);
  const [justRevealed, setJustRevealed] = useState(false);
  useEffect(() => {
    if (revealed && !seenRevealed.current) setJustRevealed(true);
    seenRevealed.current = revealed;
  }, [revealed]);
  useEffect(() => {
    setEditing(false);
    setJustRevealed(false);
    seenRevealed.current = revealed;
  }, [question.id]);

  const saved = (next: QuestionState) => {
    setEditing(false);
    onChange(next);
    invalidate('progress');
    if (next.revealedAt) {
      invalidate('history');
      invalidate('today'); // the streak may have grown
    }
  };

  return (
    <article class={`qcard${justRevealed ? ' qcard--just-revealed' : ''}`}>
      <div class="qcard__meta">
        <CategoryLabel question={question} />
        <SourceBadge question={question} />
        {daily && <span class="chip chip--daily">Today’s question</span>}
      </div>
      <h2 class="qcard__text">{questionText(question, partnerName)}</h2>
      {!state ? (
        <div class="qcard__skeleton" aria-hidden="true" />
      ) : revealed ? (
        <Revealed key={question.id} question={question} state={state} onChange={onChange} />
      ) : state.mine && !editing ? (
        <Waiting state={state} daily={daily} onEdit={() => setEditing(true)} />
      ) : (
        <Composer
          key={`${question.id}-${editing}`}
          question={question}
          state={state}
          onSaved={saved}
          onCancel={editing ? () => setEditing(false) : undefined}
        />
      )}
    </article>
  );
}

function Composer({
  question,
  state,
  onSaved,
  onCancel,
}: {
  question: QuestionDTO;
  state: QuestionState;
  onSaved: (s: QuestionState) => void;
  onCancel?: () => void;
}) {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'your partner';
  const draft = useDraft(me.user.id, question.id, 'answer', { initial: state.mine?.text });
  const text = draft.text;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: Event) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await draft.settle();
      const next = await api.answer(question.id, text);
      draft.clear();
      onSaved(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const words = wordCount(text);
  return (
    <form class="composer" onSubmit={submit}>
      {state.partnerAnswered && (
        <p class="callout">
          <Avatar name={partnerName} who="partner" size={24} />
          <span>
            {partnerName} has written their answer. Write yours to read it.
          </span>
        </p>
      )}
      <AutoTextarea
        class="journal-input"
        value={text}
        onValue={draft.setText}
        maxLength={LIMITS.answerMax}
        rows={6}
        placeholder="Take your time. Write as much or as little as feels true."
        aria-label="Your answer"
      />
      <div class="composer__footer">
        {words ? (
          <span class="composer__count">
            {words} word{words === 1 ? '' : 's'}
            {!state.mine ? ' · draft saved' : ''}
          </span>
        ) : (
          <span class="composer__tip">{pick(WRITING_TIPS, question.id, 7)}</span>
        )}
        <div class="row">
          {onCancel && (
            <button type="button" class="btn btn--ghost btn--sm" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button class="btn btn--primary btn--sm" disabled={!text.trim() || busy}>
            {busy ? 'Saving…' : state.mine ? 'Save changes' : state.partnerAnswered ? `Save & read ${partnerName}’s` : 'Save answer'}
          </button>
        </div>
      </div>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      {!state.partnerAnswered && (
        <p class="hint">
          <LockIcon size={14} /> {partnerName} won’t see this until they’ve written theirs. You can edit it until then.
        </p>
      )}
    </form>
  );
}

export function JournalEntry({
  answer,
  who,
  name,
  onEdit,
  children,
}: {
  answer: AnswerDTO;
  who: 'me' | 'partner';
  name: string;
  onEdit?: () => void;
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
      <div class="entry__text">{answer.text}</div>
      {children}
    </section>
  );
}

/**
 * Earlier versions of a question's answers and replies, fetched the first time someone asks to
 * see them, and again after any edit.
 */
function useVersions(questionId: string, state: QuestionState) {
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
function EarlierVersions({ editedAt, versions, load }: { editedAt: number; versions: VersionDTO[] | undefined; load: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && !versions) load();
  }, [open, versions]);
  return (
    <div class="versions">
      <button type="button" class="link-button versions__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <HistoryIcon size={14} /> Edited {formatDate(editedAt)} · {open ? 'Hide earlier versions' : 'See what changed'}
      </button>
      {open && <VersionList versions={versions} />}
    </div>
  );
}

function VersionList({ versions }: { versions: VersionDTO[] | undefined }) {
  if (!versions) return <p class="versions__loading">Loading…</p>;
  return (
    <ol class="versions__list" aria-label="Earlier versions">
      {versions.map((v) => (
        <li class="versions__item">
          <time class="versions__date">Written {formatDate(v.writtenAt)}</time>
          <p class="versions__text">{v.text}</p>
        </li>
      ))}
    </ol>
  );
}

function Waiting({ state, daily, onEdit }: { state: QuestionState; daily?: boolean; onEdit: () => void }) {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'your partner';
  const [nudging, setNudging] = useState(false);
  async function nudge() {
    setNudging(true);
    try {
      const { delivered } = await api.nudge();
      toast(delivered ? `Sent ${partnerName} a gentle nudge.` : `${partnerName} hasn’t turned on notifications yet.`);
    } catch (err) {
      toastError(err);
    } finally {
      setNudging(false);
    }
  }
  return (
    <div class="waiting">
      <JournalEntry answer={state.mine!} who="me" name={me.user.name} />
      <div class="waiting__status">
        <Raccoon pose="peek" size={52} />
        <span>
          Waiting for {partnerName}. You’ll read each other’s answers once they’ve written theirs.
        </span>
      </div>
      <div class="row">
        <button class="btn btn--ghost btn--sm" onClick={onEdit}>
          <PencilIcon size={16} /> Edit
        </button>
        {daily && (
          <button class="btn btn--ghost btn--sm" onClick={nudge} disabled={nudging}>
            <SendIcon size={16} /> Nudge {partnerName}
          </button>
        )}
      </div>
    </div>
  );
}

// Expressive-writing studies found the most benefit when people wrote about feelings and what
// events meant to them, not just what happened (Pennebaker, 1997). See docs/research.md.
const WRITING_TIPS = [
  'Write about how it felt, not just what happened.',
  'Try to say why it matters to you.',
  'A specific moment can say more than a summary.',
  'It’s fine to write what you’re still unsure about.',
  'Write so your partner can understand you, not to win them over.',
];

/** A stable pick per question, so the tip doesn't change while you write. */
const pick = (list: string[], id: string, salt = 0) => list[([...id].reduce((n, ch) => n + ch.charCodeAt(0), salt)) % list.length]!;

// Responding well is where the benefit is (perceived responsiveness; Gable’s work on
// active-constructive responding; question-asking and liking). See docs/research.md.
const RESPONSE_PROMPTS = [
  'Reflect back what you heard before adding your own view.',
  'Ask a follow-up question — curiosity is one of the clearest signs of care.',
  'Name something in their answer you appreciated or didn’t know.',
  'If something surprised or moved you, say so, and ask about it.',
  'Share what their answer meant to you, not just whether you agree.',
];

function Revealed({ question, state, onChange }: { question: QuestionDTO; state: QuestionState; onChange: (s: QuestionState) => void }) {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'your partner';
  const partnerId = me.partner?.id ?? '';
  const [editingAnswer, setEditingAnswer] = useState(false);
  const versions = useVersions(question.id, state);
  const edited = (next: QuestionState) => {
    onChange(next);
    invalidate('history');
    invalidate('today');
  };
  // A reply sent since a draft was saved (maybe from another device) makes that draft stale.
  const lastSent = Math.max(0, ...state.responses.filter((r) => r.userId === me.user.id).map((r) => r.createdAt));
  const draft = useDraft(me.user.id, question.id, 'response', { staleBefore: lastSent });
  const text = draft.text;
  const [busy, setBusy] = useState(false);
  const tip = pick(RESPONSE_PROMPTS, question.id);

  async function send(e: Event) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await draft.settle();
      onChange(await api.respond(question.id, text));
      draft.clear();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="reveal">
      <JournalEntry answer={state.partner!} who="partner" name={partnerName}>
        {state.partner!.editedAt && (
          <EarlierVersions editedAt={state.partner!.editedAt} versions={versions.data?.answers[partnerId] ?? (versions.data ? [] : undefined)} load={versions.load} />
        )}
      </JournalEntry>
      {editingAnswer ? (
        <EditAnswer
          question={question}
          answer={state.mine!}
          onSaved={(next) => {
            setEditingAnswer(false);
            edited(next);
          }}
          onCancel={() => setEditingAnswer(false)}
        />
      ) : (
        <JournalEntry answer={state.mine!} who="me" name={me.user.name} onEdit={() => setEditingAnswer(true)}>
          {state.mine!.editedAt && (
            <EarlierVersions editedAt={state.mine!.editedAt} versions={versions.data?.answers[me.user.id] ?? (versions.data ? [] : undefined)} load={versions.load} />
          )}
        </JournalEntry>
      )}
      <section class="conversation" aria-label="Conversation">
        <h3 class="conversation__title">Conversation</h3>
        {state.responses.length > 0 && (
          <ol class="thread">
            {state.responses.map((r) => (
              <Message
                key={r.id}
                reply={r}
                mine={r.userId === me.user.id}
                name={partnerName}
                questionId={question.id}
                versions={versions.data?.responses[r.id] ?? (versions.data ? [] : undefined)}
                loadVersions={versions.load}
                onChange={edited}
              />
            ))}
          </ol>
        )}
        <form class="composer composer--reply" onSubmit={send}>
          <AutoTextarea
            value={text}
            onValue={draft.setText}
            maxLength={LIMITS.responseMax}
            rows={2}
            placeholder={state.responses.length ? 'Reply…' : `Respond to ${partnerName}…`}
            aria-label={`Respond to ${partnerName}`}
          />
          <div class="composer__footer">
            <span class="composer__tip">{tip}</span>
            <button class="btn btn--primary btn--sm" disabled={!text.trim() || busy}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/** Editing your answer after the reveal. The version your partner read is kept. */
function EditAnswer({
  question,
  answer,
  onSaved,
  onCancel,
}: {
  question: QuestionDTO;
  answer: AnswerDTO;
  onSaved: (s: QuestionState) => void;
  onCancel: () => void;
}) {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'your partner';
  const [text, setText] = useState(answer.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: Event) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    if (text.trim() === answer.text) return onCancel();
    setBusy(true);
    setError('');
    try {
      onSaved(await api.answer(question.id, text));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const words = wordCount(text);
  return (
    <form class="composer" onSubmit={submit}>
      <AutoTextarea class="journal-input" value={text} onValue={setText} maxLength={LIMITS.answerMax} rows={6} aria-label="Your answer" />
      <div class="composer__footer">
        <span class="composer__count">
          {words} word{words === 1 ? '' : 's'}
        </span>
        <div class="row">
          <button type="button" class="btn btn--ghost btn--sm" onClick={onCancel}>
            Cancel
          </button>
          <button class="btn btn--primary btn--sm" disabled={!text.trim() || busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      <p class="hint">
        <HistoryIcon size={14} /> {partnerName} has read this answer. If you change it, the version they read stays in its history, for both of you.
      </p>
    </form>
  );
}

/** A reply in the conversation. You can edit your own; earlier versions are kept for both of you. */
function Message({
  reply,
  mine,
  name,
  questionId,
  versions,
  loadVersions,
  onChange,
}: {
  reply: ResponseDTO;
  mine: boolean;
  name: string;
  questionId: string;
  versions: VersionDTO[] | undefined;
  loadVersions: () => void;
  onChange: (s: QuestionState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(reply.text);
  const [busy, setBusy] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  useEffect(() => {
    if (showVersions && !versions) loadVersions();
  }, [showVersions, versions]);

  async function save(e: Event) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    if (text.trim() === reply.text) return setEditing(false);
    setBusy(true);
    try {
      onChange(await api.editReply(questionId, reply.id, text));
      setEditing(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li class={`message message--${mine ? 'me' : 'partner'}${editing ? ' message--editing' : ''}`}>
      <span class="message__meta">
        {mine ? 'You' : name} · {relativeTime(reply.createdAt)}
        {reply.editedAt && (
          <>
            {' · '}
            <button type="button" class="message__action" aria-expanded={showVersions} onClick={() => setShowVersions(!showVersions)}>
              edited
            </button>
          </>
        )}
        {mine && !editing && (
          <>
            {' · '}
            <button
              type="button"
              class="message__action"
              onClick={() => {
                setText(reply.text);
                setEditing(true);
              }}
            >
              Edit
            </button>
          </>
        )}
      </span>
      {editing ? (
        <form class="message__edit" onSubmit={save}>
          <AutoTextarea value={text} onValue={setText} maxLength={LIMITS.responseMax} rows={2} aria-label="Edit your reply" />
          <div class="row">
            <button type="button" class="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button class="btn btn--primary btn--sm" disabled={!text.trim() || busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <p class="message__text">{reply.text}</p>
      )}
      {showVersions && <VersionList versions={versions} />}
    </li>
  );
}
