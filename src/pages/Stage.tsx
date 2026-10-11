import { useState } from 'preact/hooks';
import type { CoupleStage } from '../../shared/api';
import { api } from '../api';
import { setMe, useMe } from '../lib/session';
import { toastError } from '../lib/toast';

const QUESTIONS: { key: keyof CoupleStage; label: string; no: string; yes: string }[] = [
  { key: 'married', label: 'Are you married?', no: 'Not married', yes: 'Married' },
  { key: 'livingTogether', label: 'Do you live together?', no: 'Not yet', yes: 'We live together' },
  { key: 'hasKids', label: 'Do you have children?', no: 'No children', yes: 'We have children' },
];

/** The three stage toggles, shared by onboarding and Settings. */
export function StageFields({ value, onChange }: { value: CoupleStage; onChange: (v: CoupleStage) => void }) {
  return (
    <div class="stage">
      {QUESTIONS.map((q) => (
        <fieldset class="stage__row">
          <legend class="stage__label">{q.label}</legend>
          <div class="segmented" role="radiogroup" aria-label={q.label}>
            {([false, true] as const).map((v) => (
              <button type="button" role="radio" aria-checked={value[q.key] === v} onClick={() => onChange({ ...value, [q.key]: v })}>
                {v ? q.yes : q.no}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function StageSetup({ onDone }: { onDone: () => void }) {
  const me = useMe();
  const couple = me.couple!;
  const [stage, setStage] = useState<CoupleStage>({ married: couple.married, livingTogether: couple.livingTogether, hasKids: couple.hasKids });
  const [busy, setBusy] = useState(false);
  const complete = stage.married !== null && stage.livingTogether !== null && stage.hasKids !== null;

  async function save() {
    setBusy(true);
    try {
      setMe(await api.updateCouple({ married: stage.married!, livingTogether: stage.livingTogether!, hasKids: stage.hasKids! }));
      onDone();
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  return (
    <main class="page page--narrow">
      <p class="eyebrow">Welcome, {me.user.name} & {me.partner?.name}</p>
      <h1 class="page__title">About the two of you</h1>
      <p class="page__lede">
        This shapes which questions you’ll get. If marriage, children or sharing a home are still ahead of you (or undecided), you’ll get
        questions that explore them hypothetically — conversations research suggests are worth having on purpose, not by sliding into
        them. You can change this anytime in Settings.
      </p>
      <section class="card">
        <StageFields value={stage} onChange={setStage} />
      </section>
      <button class="btn btn--primary btn--block" disabled={!complete || busy} onClick={save}>
        Continue
      </button>
      <button class="link-button link-button--center" onClick={onDone}>
        Skip for now
      </button>
    </main>
  );
}
