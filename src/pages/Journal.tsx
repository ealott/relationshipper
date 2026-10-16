import { useLocation } from 'preact-iso';
import { useState } from 'preact/hooks';
import type { JournalDay } from '../../shared/api';
import { JOURNAL_PROMPTS, parseEntry } from '../../shared/journal';
import { zonedNow } from '../../shared/time';
import { api } from '../api';
import { ErrorNotice } from '../components/Feedback';
import { BackIcon } from '../components/Icons';
import { JournalDayCard } from '../components/JournalDay';
import { dayWord, NewDayNotice } from '../components/NewDay';
import { useJournal, useJournalDay } from '../lib/data';
import { hasDraft, readDraft } from '../lib/drafts';
import { formatDay } from '../lib/format';
import { typingIn, useHeldDay } from '../lib/heldDay';
import { useMe } from '../lib/session';
import { toastError } from '../lib/toast';

const loadingCard = (
  <div class="qcard qcard--loading">
    <div class="qcard__skeleton" aria-hidden="true" />
  </div>
);

/** A journal draft with something in it (an emptied line doesn't count). */
function entryStarted(text: string): boolean {
  if (!text.trim()) return false;
  const e = parseEntry(text);
  return JOURNAL_PROMPTS.some(({ key }) => e[key].some((line) => line.trim())) || Boolean(e.note.trim());
}

export function Journal() {
  const me = useMe();
  const today = useJournalDay('today');
  // Past midnight, keep the day you're writing about on screen until you move on.
  const held = useHeldDay(today.data, (d) => entryStarted(readDraft(me.user.id, d.questionId, 'answer')) || hasDraft(me.user.id, d.questionId, 'response') || typingIn('.qcard'));
  const shown = held.shown;
  const list = useJournal();
  const { route } = useLocation();
  const [older, setOlder] = useState<{ days: JournalDay[]; next: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const days = [...(list.data?.days ?? []), ...(older?.days ?? [])].filter((d) => d.day !== list.data?.today);
  const next = older ? older.next : list.data?.nextCursor;
  const couple = me.couple!;
  const firstDay = zonedNow(couple.timezone, new Date(couple.createdAt)).day;

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await api.journal(next);
      setOlder({ days: [...(older?.days ?? []), ...page.days], next: page.nextCursor });
    } catch (err) {
      toastError(err);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main class="page">
      <header class="page__header">
        <div>
          <p class="eyebrow">{shown ? formatDay(shown.day) : ' '}</p>
          <h1 class="page__title">Journal</h1>
        </div>
      </header>

      {shown ? (
        <JournalDayCard day={shown} onChange={(d) => (held.holding ? held.update(d) : today.mutate(d))} />
      ) : today.error ? (
        <ErrorNotice error={today.error} onRetry={today.refresh} />
      ) : (
        loadingCard
      )}
      {held.holding && shown && (
        <NewDayNotice action="Go to today" onMoveOn={held.moveOn}>
          It’s past midnight. What you’re writing about {dayWord(shown.day, today.data?.day ?? shown.day)} is saved; finish it when you’re ready.
        </NewDayNotice>
      )}

      <section class="section">
        <div class="row row--spread">
          <h2 class="section__title">Earlier days</h2>
          {list.data && (
            <label class="jday-picker">
              <span>Write about another day</span>
              <input
                type="date"
                class="input input--time"
                min={firstDay}
                max={list.data.today}
                onChange={(e) => e.currentTarget.value && route(`/journal/${e.currentTarget.value}`)}
              />
            </label>
          )}
        </div>
        {days.length ? (
          <ol class="jdays">
            {days.map((d) => (
              <DayRow day={d} />
            ))}
          </ol>
        ) : (
          list.data && <p class="muted">The days you write about will collect here.</p>
        )}
        {next && (
          <button class="btn btn--ghost btn--block" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Show older days'}
          </button>
        )}
      </section>
    </main>
  );
}

function DayRow({ day }: { day: JournalDay }) {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'your partner';
  const { state } = day;
  const yourTurn = state.partnerAnswered && !state.mine;
  const status = state.revealedAt !== null ? 'Shared' : state.mine ? `Waiting for ${partnerName}` : `${partnerName} wrote · your turn`;
  const mine = state.mine ? parseEntry(state.mine.text) : null;
  const preview = mine ? [...JOURNAL_PROMPTS.map((p) => mine[p.key][0]).filter(Boolean), mine.note].filter(Boolean).join(' · ') : '';
  return (
    <li>
      <a class="jday" href={`/journal/${day.day}`}>
        <span class="jday__top">
          <span class="jday__date">{formatDay(day.day)}</span>
          <span class={`jday__status${yourTurn ? ' jday__status--turn' : ''}`}>{status}</span>
        </span>
        {preview && <span class="jday__preview">{preview}</span>}
      </a>
    </li>
  );
}

export function JournalDayPage({ day }: { day: string }) {
  const loaded = useJournalDay(day);
  return (
    <main class="page">
      <a
        href="/journal"
        class="back-link"
        onClick={(e) => {
          if (history.length > 1) {
            e.preventDefault();
            history.back();
          }
        }}
      >
        <BackIcon size={18} /> Journal
      </a>
      {loaded.data ? (
        <JournalDayCard day={loaded.data} onChange={(d) => loaded.mutate(d)} />
      ) : loaded.error ? (
        <ErrorNotice error={loaded.error} onRetry={loaded.refresh} />
      ) : (
        loadingCard
      )}
    </main>
  );
}
