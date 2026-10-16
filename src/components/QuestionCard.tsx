import { useEffect, useRef, useState } from 'preact/hooks';
import { LIMITS, type AnswerDTO, type QuestionDTO, type QuestionState } from '../../shared/api';
import { questionText } from '../../shared/categories';
import { wordCount } from '../../shared/text';
import { api } from '../api';
import { useDraft } from '../lib/drafts';
import { invalidate } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { Avatar } from './Avatar';
import { Conversation, pick } from './Conversation';
import { AnswerEntry, EarlierVersions, useVersions } from './Entry';
import { AutoTextarea } from './Field';
import { HistoryIcon, LockIcon, PencilIcon, SendIcon } from './Icons';
import { CategoryLabel, SourceBadge } from './QuestionMeta';
import { Raccoon } from './Raccoon';

interface Props {
  question: QuestionDTO;
  state: QuestionState | undefined;
  onChange: (state: QuestionState) => void;
  daily?: boolean;
  /** A label in place of "Today’s question", such as for yesterday's kept past midnight. */
  chip?: string;
}

export function QuestionCard({ question, state, onChange, daily, chip }: Props) {
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
        {(daily || chip) && <span class="chip chip--daily">{chip ?? 'Today’s question'}</span>}
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
      <AnswerEntry answer={state.mine!} who="me" name={me.user.name} />
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

  return (
    <div class="reveal">
      <AnswerEntry answer={state.partner!} who="partner" name={partnerName}>
        {state.partner!.editedAt && (
          <EarlierVersions editedAt={state.partner!.editedAt} versions={versions.data?.answers[partnerId] ?? (versions.data ? [] : undefined)} load={versions.load} />
        )}
      </AnswerEntry>
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
        <AnswerEntry answer={state.mine!} who="me" name={me.user.name} onEdit={() => setEditingAnswer(true)}>
          {state.mine!.editedAt && (
            <EarlierVersions editedAt={state.mine!.editedAt} versions={versions.data?.answers[me.user.id] ?? (versions.data ? [] : undefined)} load={versions.load} />
          )}
        </AnswerEntry>
      )}
      <Conversation questionId={question.id} state={state} onChange={edited} versions={versions.data} loadVersions={versions.load} />
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
