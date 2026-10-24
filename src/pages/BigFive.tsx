import { IPIP50, IPIP_SCALE } from '../../shared/bigFive';
import { BigFiveProfile, BigFiveResearch } from '../components/BigFive';
import { ErrorNotice, Spinner } from '../components/Feedback';
import { QuestionnaireTake, ResultHistory, selfBack, ShareSetting, usePartnerAnchor } from '../components/Questionnaire';
import { formatDate } from '../lib/format';
import { useQuestionnaires } from '../lib/data';
import { useMe } from '../lib/session';

/** Your Big Five profile: the latest, how it's changed, every time you've taken it, and sharing. */
export function BigFive() {
  const me = useMe();
  const q = useQuestionnaires();
  const partnerName = me.partner?.name ?? null;
  const data = q.data;
  const theirs = data?.partner.find((r) => r.instrument === 'big-five');
  usePartnerAnchor(!!theirs);
  if (q.error && !data) return <main class="page">{selfBack}<ErrorNotice error={q.error} onRetry={q.refresh} /></main>;
  if (!data) return <main class="page">{selfBack}<Spinner /></main>;
  const mine = data.mine.filter((r) => r.instrument === 'big-five');
  const [latest, previous] = mine;

  return (
    <main class="page">
      {selfBack}
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

      {partnerName && latest && <ShareSetting instrument="big-five" partnerName={partnerName} shared={data.sharing.includes('big-five')} />}

      {theirs && (
        <section class="card big-five" id="partner">
          <h2 class="card__title">{partnerName}’s personality</h2>
          <p class="muted">Shared with you, from {formatDate(theirs.createdAt)}.</p>
          <BigFiveProfile scores={theirs.scores} />
        </section>
      )}

      {latest && <ResultHistory title="Every time you’ve taken it" results={mine} />}

      <BigFiveResearch />
    </main>
  );
}

const ITEMS = IPIP50.map((item) => ({ text: item.text, prompt: 'How accurately does this describe you?' }));
const SCALE = IPIP_SCALE.map((label, i) => ({ label, value: i + 1 }));

/** The 50 statements, one at a time. */
export function BigFiveTake() {
  return (
    <QuestionnaireTake
      instrument="big-five"
      title="The Big Five"
      intro={
        <>
          <p>
            50 short statements, about 8 minutes. For each, choose how accurately it describes you. Describe yourself as you generally are now, not as you wish to be,
            and as you honestly see yourself compared with people you know of about your age.
          </p>
          <p class="muted">There are no right answers. Your answers stay private; only your scores can ever be shared, and only if you choose to.</p>
        </>
      }
      items={ITEMS}
      scale={SCALE}
      scaleLabel="How accurately it describes you"
      resultPath="/self/big-five"
      research={<BigFiveResearch />}
    />
  );
}
