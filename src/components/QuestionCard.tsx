import { useEffect, useRef, useState } from 'preact/hooks';
import { LIMITS, type AnswerDTO, type QuestionDTO, type QuestionState } from '../../shared/api';
import { questionText } from '../../shared/categories';
import { api, ApiError } from '../api';
import { useDraft } from '../lib/drafts';
import { formatDate, relativeTime, wordCount } from '../lib/format';
import { invalidate } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { Avatar } from './Avatar';
import { AutoTextarea } from './Field';
import { LockIcon, PencilIcon, SendIcon } from './Icons';
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
          onLocked={async () => onChange((await api.question(question.id)).state)}
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
  onLocked,
}: {
  question: QuestionDTO;
  state: QuestionState;
  onSaved: (s: QuestionState) => void;
  onCancel?: () => void;
  onLocked: () => void;
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
      if (err instanceof ApiError && err.code === 'answer_locked') onLocked();
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

export function JournalEntry({ answer, who, name }: { answer: AnswerDTO; who: 'me' | 'partner'; name: string }) {
  return (
    <section class={`entry entry--${who}`}>
      <header class="entry__head">
        <Avatar name={name} who={who} size={26} />
        <span class="entry__name">{who === 'me' ? 'You' : name}</span>
        <time class="entry__date">{formatDate(answer.updatedAt)}</time>
      </header>
      <div class="entry__text">{answer.text}</div>
    </section>
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
      <JournalEntry answer={state.partner!} who="partner" name={partnerName} />
      <JournalEntry answer={state.mine!} who="me" name={me.user.name} />
      <section class="conversation" aria-label="Conversation">
        <h3 class="conversation__title">Conversation</h3>
        {state.responses.length > 0 && (
          <ol class="thread">
            {state.responses.map((r) => {
              const mine = r.userId === me.user.id;
              return (
                <li class={`message message--${mine ? 'me' : 'partner'}`}>
                  <span class="message__meta">
                    {mine ? 'You' : partnerName} · {relativeTime(r.createdAt)}
                  </span>
                  <p class="message__text">{r.text}</p>
                </li>
              );
            })}
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
