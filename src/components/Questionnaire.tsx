import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import type { Instrument, SelfResultDTO } from '../../shared/api';
import { api } from '../api';
import { formatDate } from '../lib/format';
import { getFlag, setFlag } from '../lib/platform';
import { invalidate } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { Switch } from './Field';
import { BackIcon, TrashIcon } from './Icons';

// What the questionnaires in Self (#63, #65) share: taking one, sharing its scores, and the list
// of every time you've taken it.

export const selfBack = (
  <a href="/self" class="back-link">
    <BackIcon size={18} /> Self
  </a>
);

/** Self links to #partner, which isn't on the page until the scores have loaded. */
export function usePartnerAnchor(ready: boolean) {
  useEffect(() => {
    if (ready && location.hash === '#partner') document.getElementById('partner')?.scrollIntoView();
  }, [ready]);
}

/** Sharing your latest scores with your partner: a choice, never required. */
export function ShareSetting({ instrument, partnerName, shared }: { instrument: Instrument; partnerName: string; shared: boolean }) {
  const [busy, setBusy] = useState(false);

  async function share(next: boolean) {
    setBusy(true);
    try {
      await api.shareQuestionnaire(instrument, next);
      invalidate('questionnaires');
      toast(next ? `${partnerName} can see your latest scores.` : 'Only you can see your scores now.');
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card settings">
      <div class="setting">
        <div class="setting__text">
          <span class="setting__label">Share with {partnerName}</span>
          <span class="setting__hint">
            {shared
              ? `${partnerName} sees your latest scores, never your answers. Turn it off any time.`
              : `Only you see your scores. If you share them, ${partnerName} sees your latest scores, never your answers.`}
          </span>
        </div>
        <Switch label={`Share with ${partnerName}`} checked={shared} disabled={busy} onChange={share} />
      </div>
    </section>
  );
}

/** Every result, newest first. Any of them can be deleted. */
export function ResultHistory({ title, results, detail }: { title: string; results: SelfResultDTO[]; detail?: (r: SelfResultDTO) => string }) {
  async function remove(id: string) {
    if (!confirm('Delete this result? It can’t be brought back.')) return;
    try {
      await api.removeResult(id);
      invalidate('questionnaires');
      toast('Result deleted.');
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <section class="section">
      <h2 class="section__title">{title}</h2>
      <ul class="results">
        {results.map((r) => (
          <li class="result-row">
            <span class="result-row__date">{formatDate(r.createdAt)}</span>
            {detail && <span class="result-row__detail muted">{detail(r)}</span>}
            <button class="icon-button" aria-label={`Delete the result from ${formatDate(r.createdAt)}`} onClick={() => remove(r.id)}>
              <TrashIcon size={18} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface TakeItem {
  text: string;
  /** The question each statement answers. */
  prompt: string;
}

/** A questionnaire, one statement at a time. Answers stay on this device until the last one. */
export function QuestionnaireTake({
  instrument,
  title,
  intro,
  items,
  scale,
  scaleLabel,
  resultPath,
  research,
}: {
  instrument: Instrument;
  title: string;
  intro: ComponentChildren;
  items: readonly TakeItem[];
  scale: readonly { label: string; value: number }[];
  /** Names the answers for screen readers. */
  scaleLabel: string;
  resultPath: string;
  research: ComponentChildren;
}) {
  const me = useMe();
  const { route } = useLocation();
  const key = `${instrument}:${me.user.id}`;
  const [answers, setAnswers] = useState<(number | null)[]>(() => {
    try {
      const saved = JSON.parse(getFlag(key) ?? '[]') as unknown;
      if (Array.isArray(saved) && saved.length === items.length) return saved as (number | null)[];
    } catch {
      // Start fresh.
    }
    return items.map(() => null);
  });
  const firstOpen = answers.findIndex((a) => a === null);
  const [index, setIndex] = useState(() => (answers.every((a) => a === null) ? -1 : firstOpen === -1 ? items.length - 1 : firstOpen));
  const [busy, setBusy] = useState(false);
  const done = answers.every((a) => a !== null);
  const answered = answers.filter((a) => a !== null).length;

  function answer(value: number) {
    const next = answers.map((a, i) => (i === index ? value : a));
    setAnswers(next);
    setFlag(key, JSON.stringify(next));
    if (index < items.length - 1) setIndex(index + 1);
  }

  async function finish() {
    if (!done || busy) return;
    setBusy(true);
    try {
      await api.submitQuestionnaire(instrument, answers as number[]);
      setFlag(key, null);
      invalidate('questionnaires');
      route(resultPath, true);
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  if (index === -1) {
    return (
      <main class="page">
        {selfBack}
        <header class="page__header">
          <div>
            <h1 class="page__title">{title}</h1>
          </div>
        </header>
        <section class="card take-intro">
          {intro}
          <button class="btn btn--primary" onClick={() => setIndex(0)}>
            Begin
          </button>
        </section>
        {research}
      </main>
    );
  }

  const item = items[index]!;
  return (
    <main class="page">
      {selfBack}
      <div class="take">
        <div class="take__progress" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={answered} aria-label="Answered">
          <span style={{ width: `${(answered / items.length) * 100}%` }} />
        </div>
        <p class="eyebrow">
          {index + 1} of {items.length}
        </p>
        <p class="take__prompt muted">{item.prompt}</p>
        <h1 class="take__statement">{item.text}</h1>
        <div class="take__options" role="radiogroup" aria-label={scaleLabel}>
          {scale.map(({ label, value }) => (
            <button role="radio" aria-checked={answers[index] === value} class={`take__option${answers[index] === value ? ' is-selected' : ''}`} onClick={() => answer(value)}>
              {label}
            </button>
          ))}
        </div>
        <div class="row row--spread">
          <button class="btn btn--ghost btn--sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            <BackIcon size={16} /> Back
          </button>
          {done && (
            <button class="btn btn--primary btn--sm" disabled={busy} onClick={finish}>
              {busy ? 'Saving…' : 'See your scores'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
