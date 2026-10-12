import { useState } from 'preact/hooks';
import type { JournalDay, QuestionState } from '../../shared/api';
import {
  emptyEntry,
  isEmptyEntry,
  isWeeklyDay,
  JOURNAL_LIMITS,
  JOURNAL_PROMPTS,
  parseEntry,
  serializeEntry,
  WEEKLY_PROMPT,
  type JournalEntry,
  type JournalPromptKey,
} from '../../shared/journal';
import { api } from '../api';
import { useJournal } from '../lib/data';
import { useDraft } from '../lib/drafts';
import { formatDay } from '../lib/format';
import { invalidate } from '../lib/query';
import { useMe } from '../lib/session';
import { Conversation } from './Conversation';
import { AnswerEntry, EarlierVersions, useVersions } from './Entry';
import { AutoTextarea } from './Field';
import { ChevronIcon, HistoryIcon, LockIcon, NotebookIcon, PencilIcon } from './Icons';
import { Raccoon } from './Raccoon';

const PLACEHOLDERS: Record<JournalPromptKey, string> = {
  good: 'A moment, a win, a laugh…',
  hard: 'Something that weighed on you…',
  thanks: 'Something they did or said…',
};

const period = (weekly: boolean) => (weekly ? 'week' : 'day');

/** A day's entry: the lines for each prompt, then any longer note. */
export function JournalEntryView({ text, weekly }: { text: string; weekly: boolean }) {
  const entry = parseEntry(text);
  return (
    <div class="jentry">
      {JOURNAL_PROMPTS.map(({ key, heading }) =>
        entry[key].length ? (
          <section class="jentry__group">
            <h4 class="jentry__heading">
              <span class={`jentry__dot jentry__dot--${key}`} aria-hidden="true" />
              {heading}
            </h4>
            <ul class="jentry__lines">
              {entry[key].map((line) => (
                <li>{line}</li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {entry.note && (
        <section class="jentry__group">
          {weekly && <h4 class="jentry__heading">The week</h4>}
          <p class="jentry__note">{entry.note}</p>
        </section>
      )}
    </div>
  );
}

/** One day of the journal: write yours, wait for theirs, or read both and talk. */
export function JournalDayCard({ day, onChange }: { day: JournalDay; onChange: (d: JournalDay) => void }) {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'your partner';
  const partnerId = me.partner?.id ?? '';
  const { state } = day;
  const [editing, setEditing] = useState(false);
  const versions = useVersions(day.questionId, state);
  const render = (text: string) => <JournalEntryView text={text} weekly={day.weekly} />;
  const saved = (next: JournalDay) => {
    setEditing(false);
    onChange(next);
    invalidate('journal');
  };
  const replied = (next: QuestionState) => {
    onChange({ ...day, state: next });
    invalidate('journal');
  };

  let body;
  if (state.revealedAt !== null) {
    body = (
      <div class="reveal">
        <AnswerEntry answer={state.partner!} who="partner" name={partnerName} render={render}>
          {state.partner!.editedAt && (
            <EarlierVersions
              editedAt={state.partner!.editedAt}
              versions={versions.data?.answers[partnerId] ?? (versions.data ? [] : undefined)}
              load={versions.load}
              render={render}
            />
          )}
        </AnswerEntry>
        {editing ? (
          <JournalComposer day={day} editing={parseEntry(state.mine!.text)} onSaved={saved} onCancel={() => setEditing(false)} />
        ) : (
          <AnswerEntry answer={state.mine!} who="me" name={me.user.name} render={render} onEdit={() => setEditing(true)}>
            {state.mine!.editedAt && (
              <EarlierVersions
                editedAt={state.mine!.editedAt}
                versions={versions.data?.answers[me.user.id] ?? (versions.data ? [] : undefined)}
                load={versions.load}
                render={render}
              />
            )}
          </AnswerEntry>
        )}
        <Conversation questionId={day.questionId} state={state} onChange={replied} versions={versions.data} loadVersions={versions.load} />
      </div>
    );
  } else if (state.mine && !editing) {
    body = (
      <div class="waiting">
        <AnswerEntry answer={state.mine} who="me" name={me.user.name} render={render} />
        <div class="waiting__status">
          <Raccoon pose="peek" size={52} />
          <span>
            Waiting for {partnerName}. You’ll read about each other’s {period(day.weekly)} once they’ve written theirs.
          </span>
        </div>
        <div class="row">
          <button class="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
            <PencilIcon size={16} /> Edit
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <JournalComposer
        key={`${day.questionId}-${editing}`}
        day={day}
        editing={editing && state.mine ? parseEntry(state.mine.text) : undefined}
        onSaved={saved}
        onCancel={editing ? () => setEditing(false) : undefined}
      />
    );
  }

  return (
    <article class="qcard">
      <p class="eyebrow">{formatDay(day.day)}</p>
      <h2 class="qcard__text">How was your {period(day.weekly)}?</h2>
      {body}
    </article>
  );
}

const tidy = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean);

/** The entry being written: a few lines for each prompt, and a longer note if you like. */
function JournalComposer({
  day,
  editing,
  onSaved,
  onCancel,
}: {
  day: JournalDay;
  /** Set when changing an entry already saved, which isn't a draft. */
  editing?: JournalEntry;
  onSaved: (d: JournalDay) => void;
  onCancel?: () => void;
}) {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'your partner';
  const { state, weekly } = day;
  const draft = useDraft(me.user.id, day.questionId, 'answer', editing ? { initial: serializeEntry(editing) } : {});
  const entry = draft.text ? parseEntry(draft.text) : emptyEntry();
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cleaned: JournalEntry = { good: tidy(entry.good), hard: tidy(entry.hard), thanks: tidy(entry.thanks), note: entry.note.trim() };
  const update = (patch: Partial<JournalEntry>) => draft.setText(serializeEntry({ ...entry, ...patch }));
  const showNote = weekly || noteOpen || Boolean(entry.note);

  async function submit(e: Event) {
    e.preventDefault();
    if (isEmptyEntry(cleaned) || busy) return;
    setBusy(true);
    setError('');
    try {
      await draft.settle();
      const next = await api.writeJournal(day.day, cleaned);
      draft.clear();
      onSaved(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form class="composer jcompose" onSubmit={submit}>
      {state.partnerAnswered && !state.mine && (
        <p class="callout">
          {partnerName} has written about their {period(weekly)}. Write yours to read it.
        </p>
      )}
      {JOURNAL_PROMPTS.map(({ key, prompt }) => (
        <Lines key={key} id={key} label={prompt.replace('{partner}', partnerName)} lines={entry[key]} onChange={(lines) => update({ [key]: lines })} />
      ))}
      {showNote ? (
        <label class="jcompose__group">
          <span class="jcompose__label">{weekly ? 'Your week' : 'Say more'}</span>
          {weekly && <span class="field__hint">{WEEKLY_PROMPT} Optional, like everything here.</span>}
          <AutoTextarea
            class="journal-input jcompose__note"
            value={entry.note}
            onValue={(note) => update({ note })}
            maxLength={JOURNAL_LIMITS.noteMax}
            rows={3}
            placeholder={weekly ? 'A few sentences about your week…' : 'Anything else about your day…'}
          />
        </label>
      ) : (
        <button type="button" class="link-button" onClick={() => setNoteOpen(true)}>
          <PencilIcon size={14} /> Say more
        </button>
      )}
      <div class="composer__footer">
        <span class="composer__count">{!editing && !isEmptyEntry(cleaned) ? 'Draft saved' : ''}</span>
        <div class="row">
          {onCancel && (
            <button type="button" class="btn btn--ghost btn--sm" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button class="btn btn--primary btn--sm" disabled={isEmptyEntry(cleaned) || busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : state.partnerAnswered ? `Save & read ${partnerName}’s` : 'Save'}
          </button>
        </div>
      </div>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      {state.revealedAt !== null ? (
        <p class="hint">
          <HistoryIcon size={14} /> {partnerName} has read this. If you change it, the version they read stays in its history, for both of you.
        </p>
      ) : (
        !state.partnerAnswered && (
          <p class="hint">
            <LockIcon size={14} /> {partnerName} won’t see this until they’ve written about their {period(weekly)}. You can edit it until then.
          </p>
        )
      )}
    </form>
  );
}

/** Short lines for one prompt. Enter moves to a new line; Backspace on an empty one removes it. */
function Lines({ id, label, lines, onChange }: { id: JournalPromptKey; label: string; lines: string[]; onChange: (lines: string[]) => void }) {
  // Always one empty line at the end to write the next thing in, up to the limit.
  const shown = lines.length >= JOURNAL_LIMITS.lines || lines[lines.length - 1] === '' ? lines : [...lines, ''];
  // Straight away, so quick typing after Enter lands on the new line. (It's already rendered.)
  const focus = (form: HTMLFormElement | null, i: number) => (form?.querySelector(`[data-line="${id}-${i}"]`) as HTMLInputElement | null)?.focus();
  function set(i: number, value: string) {
    const next = shown.slice();
    next[i] = value;
    while (next.length > 1 && next[next.length - 1] === '' && next[next.length - 2] === '') next.pop();
    onChange(next);
  }
  return (
    <fieldset class="jcompose__group">
      <legend class="jcompose__label">
        <span class={`jentry__dot jentry__dot--${id}`} aria-hidden="true" />
        {label}
      </legend>
      <ul class="jcompose__lines">
        {shown.map((line, i) => (
          <li>
            <input
              class="input jcompose__line"
              data-line={`${id}-${i}`}
              value={line}
              maxLength={JOURNAL_LIMITS.lineMax}
              placeholder={i === 0 ? PLACEHOLDERS[id] : 'Another…'}
              aria-label={i === 0 ? label : `${label}, line ${i + 1}`}
              enterKeyHint="next"
              onInput={(e) => set(i, e.currentTarget.value)}
              onKeyDown={(e) => {
                const form = e.currentTarget.form;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (line.trim()) focus(form, i + 1);
                } else if (e.key === 'Backspace' && !line && i > 0) {
                  e.preventDefault();
                  onChange(shown.filter((_, j) => j !== i));
                  focus(form, i - 1);
                }
              }}
            />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** On Today: where today's journal stands, and the way in. */
export function JournalPrompt() {
  const me = useMe();
  const journal = useJournal().data;
  if (!journal) return null;
  const partnerName = me.partner?.name ?? 'your partner';
  const weekly = isWeeklyDay(journal.today);
  const state = journal.days.find((d) => d.day === journal.today)?.state;
  let text;
  if (state?.revealedAt) text = `You’ve both written about your ${period(weekly)}. Read ${partnerName}’s, and reply.`;
  else if (state?.mine) text = `You’ve written about your ${period(weekly)}. Waiting for ${partnerName}.`;
  else if (state?.partnerAnswered) text = `${partnerName} has written about their ${period(weekly)}. Write yours to read it.`;
  else text = weekly ? 'How was your week? A few lines, and a look back if you like.' : 'How was your day? Something good, something hard, and something you appreciated.';
  return (
    <a class="card link-card journal-card" href="/journal">
      <NotebookIcon size={22} />
      <span class="link-card__text">
        <span class="link-card__title">Journal</span>
        <span class="muted">{text}</span>
      </span>
      <ChevronIcon size={18} />
    </a>
  );
}
