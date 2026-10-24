import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { IPIP50, IPIP_SCALE } from '../../shared/bigFive';
import { api } from '../api';
import { BigFiveProfile, BigFiveResearch } from '../components/BigFive';
import { ErrorNotice, Spinner } from '../components/Feedback';
import { Switch } from '../components/Field';
import { BackIcon, TrashIcon } from '../components/Icons';
import { formatDate } from '../lib/format';
import { useQuestionnaires } from '../lib/data';
import { getFlag, setFlag } from '../lib/platform';
import { invalidate } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';

const back = (
  <a href="/self" class="back-link">
    <BackIcon size={18} /> Self
  </a>
);

/** Your Big Five profile: the latest, how it's changed, every time you've taken it, and sharing. */
export function BigFive() {
  const me = useMe();
  const q = useQuestionnaires();
  const partnerName = me.partner?.name ?? null;
  const [busy, setBusy] = useState(false);
  const data = q.data;
  const theirs = data?.partner.find((r) => r.instrument === 'big-five');
  // Self links to #partner, which isn't on the page until the scores have loaded.
  useEffect(() => {
    if (theirs && location.hash === '#partner') document.getElementById('partner')?.scrollIntoView();
  }, [!!theirs]);
  if (q.error && !data) return <main class="page">{back}<ErrorNotice error={q.error} onRetry={q.refresh} /></main>;
  if (!data) return <main class="page">{back}<Spinner /></main>;
  const mine = data.mine.filter((r) => r.instrument === 'big-five');
  const [latest, previous] = mine;
  const shared = data.sharing.includes('big-five');

  async function share(next: boolean) {
    setBusy(true);
    try {
      await api.shareQuestionnaire('big-five', next);
      invalidate('questionnaires');
      toast(next ? `${partnerName} can see your latest scores.` : 'Only you can see your scores now.');
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

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
    <main class="page">
      {back}
      <header class="page__header">
        <div>
          <h1 class="page__title">Your personality</h1>
          <p class="page__lede">{latest ? `The Big Five, from your answers on ${formatDate(latest.createdAt)}.` : 'The Big Five: five broad traits, from 50 short statements about how you generally are.'}</p>
        </div>
      </header>

      {latest ? (
        <section class="card big-five">
          <BigFiveProfile scores={latest.scores} previous={previous?.scores} />
          <p class="muted">
            Each score runs from 10 to 50 and shows where you put yourself on that scale. There are no norms to rank it against, and no type to sort you into.
          </p>
          <a class="btn btn--ghost btn--sm big-five__again" href="/self/big-five/take">
            Take it again
          </a>
        </section>
      ) : (
        <section class="card big-five">
          <p>About 8 minutes. There are no right answers, and only you see your answers.</p>
          <a class="btn btn--primary" href="/self/big-five/take">
            Start
          </a>
        </section>
      )}

      {partnerName && latest && (
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
      )}

      {theirs && (
        <section class="card big-five" id="partner">
          <h2 class="card__title">{partnerName}’s personality</h2>
          <p class="muted">Shared with you, from {formatDate(theirs.createdAt)}.</p>
          <BigFiveProfile scores={theirs.scores} />
        </section>
      )}

      {latest && (
        <section class="section">
          <h2 class="section__title">Every time you’ve taken it</h2>
          <ul class="results">
            {mine.map((r) => (
              <li class="result-row">
                <span class="result-row__date">{formatDate(r.createdAt)}</span>
                <button class="icon-button" aria-label={`Delete the result from ${formatDate(r.createdAt)}`} onClick={() => remove(r.id)}>
                  <TrashIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BigFiveResearch />
    </main>
  );
}

const progressKey = (userId: string) => `big-five:${userId}`;

/** The 50 statements, one at a time. Answers stay on this device until the last one. */
export function BigFiveTake() {
  const me = useMe();
  const { route } = useLocation();
  const [answers, setAnswers] = useState<(number | null)[]>(() => {
    try {
      const saved = JSON.parse(getFlag(progressKey(me.user.id)) ?? '[]') as unknown;
      if (Array.isArray(saved) && saved.length === IPIP50.length) return saved as (number | null)[];
    } catch {
      // Start fresh.
    }
    return IPIP50.map(() => null);
  });
  const firstOpen = answers.findIndex((a) => a === null);
  const [index, setIndex] = useState(() => (answers.every((a) => a === null) ? -1 : firstOpen === -1 ? IPIP50.length - 1 : firstOpen));
  const [busy, setBusy] = useState(false);
  const done = answers.every((a) => a !== null);
  const answered = answers.filter((a) => a !== null).length;

  function answer(value: number) {
    const next = answers.map((a, i) => (i === index ? value : a));
    setAnswers(next);
    setFlag(progressKey(me.user.id), JSON.stringify(next));
    if (index < IPIP50.length - 1) setIndex(index + 1);
  }

  async function finish() {
    if (!done || busy) return;
    setBusy(true);
    try {
      await api.submitQuestionnaire('big-five', answers as number[]);
      setFlag(progressKey(me.user.id), null);
      invalidate('questionnaires');
      route('/self/big-five', true);
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  if (index === -1) {
    return (
      <main class="page">
        {back}
        <header class="page__header">
          <div>
            <h1 class="page__title">The Big Five</h1>
          </div>
        </header>
        <section class="card big-five">
          <p>
            50 short statements, about 8 minutes. For each, choose how accurately it describes you. Describe yourself as you generally are now, not as you wish to be,
            and as you honestly see yourself compared with people you know of about your age.
          </p>
          <p class="muted">There are no right answers. Your answers stay private; only your scores can ever be shared, and only if you choose to.</p>
          <button class="btn btn--primary" onClick={() => setIndex(0)}>
            Begin
          </button>
        </section>
        <BigFiveResearch />
      </main>
    );
  }

  const item = IPIP50[index]!;
  return (
    <main class="page">
      {back}
      <div class="take">
        <div class="take__progress" role="progressbar" aria-valuemin={0} aria-valuemax={IPIP50.length} aria-valuenow={answered} aria-label="Statements answered">
          <span style={{ width: `${(answered / IPIP50.length) * 100}%` }} />
        </div>
        <p class="eyebrow">
          {index + 1} of {IPIP50.length}
        </p>
        <p class="take__prompt muted">How accurately does this describe you?</p>
        <h1 class="take__statement">{item.text}</h1>
        <div class="take__options" role="radiogroup" aria-label="How accurately it describes you">
          {IPIP_SCALE.map((label, i) => (
            <button role="radio" aria-checked={answers[index] === i + 1} class={`take__option${answers[index] === i + 1 ? ' is-selected' : ''}`} onClick={() => answer(i + 1)}>
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
              {busy ? 'Saving…' : 'See your profile'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
