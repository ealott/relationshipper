import { CHECK_IN_ITEMS, CHECK_IN_MEASURES, CHECK_IN_SCALE, CHECK_IN_STEMS, CLOSER_LOOK } from '../../shared/checkIn';
import { CheckInResearch, CheckInScores, CheckInTrend, HelpNow } from '../components/CheckIn';
import { ErrorNotice, Spinner } from '../components/Feedback';
import { QuestionnaireTake, ResultHistory, selfBack, ShareSetting, usePartnerAnchor } from '../components/Questionnaire';
import { formatDate } from '../lib/format';
import { useQuestionnaires } from '../lib/data';
import { useMe } from '../lib/session';

/** How you've been: your latest check-in, how it's changed, every check-in, and sharing. */
export function CheckIn() {
  const me = useMe();
  const q = useQuestionnaires();
  const partnerName = me.partner?.name ?? null;
  const data = q.data;
  const theirs = data?.partner.find((r) => r.instrument === 'check-in');
  usePartnerAnchor(!!theirs);
  if (q.error && !data) return <main class="page">{selfBack}<ErrorNotice error={q.error} onRetry={q.refresh} /></main>;
  if (!data) return <main class="page">{selfBack}<Spinner /></main>;
  const mine = data.mine.filter((r) => r.instrument === 'check-in');
  const [latest, previous] = mine;
  const closer = latest && CHECK_IN_MEASURES.some((m) => (latest.scores[m.id] ?? 0) >= CLOSER_LOOK);

  return (
    <main class="page">
      {selfBack}
      <header class="page__header">
        <div>
          <h1 class="page__title">How you’ve been</h1>
          <p class="page__lede">
            {latest
              ? `From your check-in on ${formatDate(latest.createdAt)}, about the two weeks before it.`
              : 'A check-in on anxiety and mood: 15 questions about the last two weeks.'}
          </p>
        </div>
      </header>

      {latest ? (
        <section class="card check-in">
          <CheckInScores scores={latest.scores} previous={previous?.scores} />
          {closer && (
            <p class="check-in__closer">
              A score of {CLOSER_LOOK} or more is where a closer look usually starts. It may help to talk with a doctor or counselor about how you’ve been.
            </p>
          )}
          <p class="muted">
            This is a check-in, not a diagnosis. The questions cover two weeks, so checking in every two weeks or so shows how things change.
          </p>
          <a class="btn btn--ghost btn--sm check-in__again" href="/self/check-in/take">
            Check in again
          </a>
        </section>
      ) : (
        <section class="card check-in">
          <p>About 3 minutes. There are no right answers, and only you see your answers.</p>
          <a class="btn btn--primary" href="/self/check-in/take">
            Start
          </a>
        </section>
      )}

      {mine.length > 1 && (
        <section class="card">
          <h2 class="card__title">Over time</h2>
          <CheckInTrend results={mine} />
        </section>
      )}

      {partnerName && latest && <ShareSetting instrument="check-in" partnerName={partnerName} shared={data.sharing.includes('check-in')} />}

      {theirs && (
        <section class="card check-in" id="partner">
          <h2 class="card__title">{partnerName}’s check-in</h2>
          <p class="muted">Shared with you, from {formatDate(theirs.createdAt)}.</p>
          <CheckInScores scores={theirs.scores} />
        </section>
      )}

      {latest && (
        <ResultHistory
          title="Every check-in"
          results={mine}
          detail={(r) => CHECK_IN_MEASURES.map((m) => `${m.name} ${r.scores[m.id] ?? 0}`).join(' · ')}
        />
      )}

      <HelpNow />
      <CheckInResearch />
    </main>
  );
}

const ITEMS = CHECK_IN_ITEMS.map((item) => ({ text: item.text, prompt: CHECK_IN_STEMS[item.measure] }));
const SCALE = CHECK_IN_SCALE.map((label, value) => ({ label, value }));

/** The 15 questions, one at a time. */
export function CheckInTake() {
  return (
    <QuestionnaireTake
      instrument="check-in"
      title="How you’ve been"
      intro={
        <>
          <p>
            15 questions about the last two weeks, about 3 minutes: seven about anxiety (the GAD-7) and eight about mood (the PHQ-8). For each, choose how often it has
            bothered you.
          </p>
          <p class="muted">This is a check-in, not a diagnosis. Your answers stay private; only your scores can ever be shared, and only if you choose to.</p>
        </>
      }
      items={ITEMS}
      scale={SCALE}
      scaleLabel="How often"
      resultPath="/self/check-in"
      research={
        <>
          <HelpNow />
          <CheckInResearch />
        </>
      }
    />
  );
}
