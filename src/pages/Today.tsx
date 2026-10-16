import { useLocation } from 'preact-iso';
import type { QuestionDTO } from '../../shared/api';
import { zonedNow } from '../../shared/time';
import { CoupleAvatars } from '../components/Avatar';
import { ErrorNotice, Spinner } from '../components/Feedback';
import { CardsIcon, ChevronIcon, PencilIcon, ShuffleIcon } from '../components/Icons';
import { QuestionCard } from '../components/QuestionCard';
import { QuestionRow } from '../components/QuestionRow';
import { InstallCard } from '../components/Install';
import { DatePrompt } from '../components/Dates';
import { JournalPrompt } from '../components/JournalDay';
import { ReminderPrompt } from '../components/ReminderPrompt';
import { BootyCallCard } from '../components/BootyCall';
import { SnuggleCard } from '../components/Snuggle';
import { NewDayNotice, UnfinishedCards } from '../components/NewDay';
import { TimelinePrompt } from '../components/Timeline';
import { idsWithStatus, randomFresh, useAvailableBank, useBootyCalls, useCatalog, useProgress, useSnuggles, useTimeline, useToday } from '../lib/data';
import { hasDraft } from '../lib/drafts';
import { formatDay } from '../lib/format';
import { typingIn, useHeldDay } from '../lib/heldDay';
import { invalidate } from '../lib/query';
import { useMe } from '../lib/session';

export function Today() {
  const me = useMe();
  const today = useToday();
  // Past midnight, keep the question you're writing on screen until you move on.
  const held = useHeldDay(
    today.data,
    (d) => hasDraft(me.user.id, d.question.id, 'answer') || hasDraft(me.user.id, d.question.id, 'response') || typingIn('.qcard'),
  );
  const shown = held.shown;
  const progress = useProgress();
  const catalog = useCatalog();
  const available = useAvailableBank();
  const snuggles = useSnuggles();
  const bootyCalls = useBootyCalls();
  const timeline = useTimeline();
  const { route } = useLocation();
  const partnerName = me.partner!.name;

  const yourTurn = idsWithStatus(progress.data?.progress, 'partner')
    .filter((id) => id !== shown?.question.id)
    .map((id) => catalog.byId.get(id))
    .filter((q): q is QuestionDTO => Boolean(q));

  const surprise = () => {
    const q = randomFresh(available, progress.data?.progress, shown?.question.id);
    if (q) route(`/q/${q.id}`);
  };

  return (
    <main class="page">
      <header class="page__header">
        <div>
          <p class="eyebrow">{shown ? formatDay(shown.day) : ' '}</p>
          <h1 class="page__title">Today</h1>
        </div>
        <div class="page__header-side">
          {shown && shown.streak > 1 && (
            <span class="streak" title="Days in a row you’ve both answered the daily question">
              {shown.streak} days in a row
            </span>
          )}
          <CoupleAvatars me={me.user.name} partner={partnerName} />
        </div>
      </header>

      <BootyCallCard query={bootyCalls} place="top" />
      <SnuggleCard query={snuggles} place="top" />
      <TimelinePrompt query={timeline} place="top" />

      {shown ? (
        <QuestionCard
          question={shown.question}
          state={shown.state}
          daily={!held.holding}
          chip={held.holding ? 'Yesterday’s question' : undefined}
          onChange={(state) => (held.holding ? held.update({ ...shown, state }) : today.mutate({ ...shown, state }))}
        />
      ) : today.error ? (
        <ErrorNotice error={today.error} onRetry={today.refresh} />
      ) : (
        <div class="qcard qcard--loading">
          <Spinner />
        </div>
      )}

      {held.holding && (
        <NewDayNotice
          action="Go to today’s question"
          onMoveOn={() => {
            held.moveOn();
            invalidate('unfinished');
          }}
        >
          It’s past midnight, so there’s a new question for today. What you’re writing here is saved; finish it when you’re ready.
        </NewDayNotice>
      )}
      <UnfinishedCards today={zonedNow(me.couple!.timezone).day} exclude={shown ? [shown.question.id] : []} />

      <JournalPrompt />
      <DatePrompt />
      <TimelinePrompt query={timeline} place="below" />
      <SnuggleCard query={snuggles} place="below" />
      <BootyCallCard query={bootyCalls} place="below" />
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
