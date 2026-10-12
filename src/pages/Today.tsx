import { useLocation } from 'preact-iso';
import type { QuestionDTO } from '../../shared/api';
import { CoupleAvatars } from '../components/Avatar';
import { ErrorNotice, Spinner } from '../components/Feedback';
import { CardsIcon, ChevronIcon, PencilIcon, ShuffleIcon } from '../components/Icons';
import { QuestionCard } from '../components/QuestionCard';
import { QuestionRow } from '../components/QuestionRow';
import { InstallCard } from '../components/Install';
import { DatePrompt } from '../components/Dates';
import { JournalPrompt } from '../components/JournalDay';
import { ReminderPrompt } from '../components/ReminderPrompt';
import { SnuggleCard } from '../components/Snuggle';
import { idsWithStatus, randomFresh, useAvailableBank, useCatalog, useProgress, useSnuggles, useToday } from '../lib/data';
import { formatDay } from '../lib/format';
import { useMe } from '../lib/session';

export function Today() {
  const me = useMe();
  const today = useToday();
  const progress = useProgress();
  const catalog = useCatalog();
  const available = useAvailableBank();
  const snuggles = useSnuggles();
  const { route } = useLocation();
  const partnerName = me.partner!.name;

  const yourTurn = idsWithStatus(progress.data?.progress, 'partner')
    .filter((id) => id !== today.data?.question.id)
    .map((id) => catalog.byId.get(id))
    .filter((q): q is QuestionDTO => Boolean(q));

  const surprise = () => {
    const q = randomFresh(available, progress.data?.progress, today.data?.question.id);
    if (q) route(`/q/${q.id}`);
  };

  return (
    <main class="page">
      <header class="page__header">
        <div>
          <p class="eyebrow">{today.data ? formatDay(today.data.day) : ' '}</p>
          <h1 class="page__title">Today</h1>
        </div>
        <div class="page__header-side">
          {today.data && today.data.streak > 1 && (
            <span class="streak" title="Days in a row you’ve both answered the daily question">
              {today.data.streak} days in a row
            </span>
          )}
          <CoupleAvatars me={me.user.name} partner={partnerName} />
        </div>
      </header>

      <SnuggleCard query={snuggles} place="top" />

      {today.data ? (
        <QuestionCard
          question={today.data.question}
          state={today.data.state}
          daily
          onChange={(state) => today.mutate({ ...today.data!, state })}
        />
      ) : today.error ? (
        <ErrorNotice error={today.error} onRetry={today.refresh} />
      ) : (
        <div class="qcard qcard--loading">
          <Spinner />
        </div>
      )}

      <JournalPrompt />
      <DatePrompt />
      <SnuggleCard query={snuggles} place="below" />
      <InstallCard />
      <ReminderPrompt />

      {yourTurn.length > 0 && (
        <section class="section">
          <div class="section__head">
            <h2 class="section__title">
              Your turn <span class="count">{yourTurn.length}</span>
            </h2>
            {yourTurn.length > 4 && (
              <a href="/answers?tab=your-turn" class="section__link">
                See all <ChevronIcon size={16} />
              </a>
            )}
          </div>
          <p class="section__hint">{partnerName} has answered these. Write yours to read theirs.</p>
          <ul class="qlist">
            {yourTurn.slice(0, 4).map((q) => (
              <QuestionRow question={q} status="your-turn" partnerName={partnerName} />
            ))}
          </ul>
        </section>
      )}

      <section class="section">
        <h2 class="section__title">Keep going</h2>
        <div class="tiles">
          <a class="tile" href="/questions/new">
            <PencilIcon />
            <strong>Ask your own</strong>
            <span>Write a question for you both to answer</span>
          </a>
          <button class="tile" onClick={surprise}>
            <ShuffleIcon />
            <strong>Another question</strong>
            <span>A prompt neither of you has answered</span>
          </button>
          <a class="tile tile--wide" href="/questions">
            <CardsIcon />
            <strong>Browse by theme</strong>
            <span>{catalog.bank.filter((q) => !q.retired).length || 'Hundreds of'} research-based prompts</span>
          </a>
        </div>
      </section>
    </main>
  );
}
