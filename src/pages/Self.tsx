import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { lifeWeekNumber, lifeWeekOf, WEEKS_PER_YEAR } from '../../shared/self';
import { ErrorNotice, Spinner } from '../components/Feedback';
import { ChevronIcon, PlusIcon, SlidersIcon } from '../components/Icons';
import {
  chapterDates,
  ChapterForm,
  LifeGrid,
  LifeLegend,
  NoteForm,
  ProfileForm,
  shortDate,
  type SelfWithProfile,
} from '../components/LifeCalendar';
import { useSelf } from '../lib/data';
import { useMe } from '../lib/session';

/** Self: a private place for knowing yourself, starting with your life in weeks. */
export function Self() {
  const me = useMe();
  const self = useSelf();
  const partnerName = me.partner?.name ?? 'your partner';
  const data = self.data;

  return (
    <main class="page">
      <header class="page__header">
        <div>
          <h1 class="page__title">Self</h1>
          <p class="page__lede">Just for you: {partnerName} doesn’t see anything here.</p>
        </div>
        <a class="btn btn--ghost btn--sm" href="/settings">
          <SlidersIcon size={16} /> Settings
        </a>
      </header>
      {self.error && !data ? (
        <ErrorNotice error={self.error} onRetry={self.refresh} />
      ) : !data ? (
        <Spinner />
      ) : !data.profile ? (
        <section class="card life-card">
          <h2 class="card__title">Your life in weeks</h2>
          <p class="muted">
            Each square is a week of your life, and each row is a year, after Tim Urban’s{' '}
            <a href="https://waitbutwhy.com/2014/05/life-weeks.html" target="_blank" rel="noopener">
              “Your Life in Weeks”
            </a>
            . Color in the chapters of your life, and note moments and plans on the weeks they happen.
          </p>
          <ProfileForm profile={null} today={data.today} submit="Show my life in weeks" />
        </section>
      ) : (
        <LifeCalendar data={data as SelfWithProfile} />
      )}
    </main>
  );
}

function LifeCalendar({ data }: { data: SelfWithProfile }) {
  const { route } = useLocation();
  const [changing, setChanging] = useState(false);
  const [chapterForm, setChapterForm] = useState<string | null>(null);
  const now = lifeWeekOf(data.profile.birthday, data.today);
  const total = data.profile.years * WEEKS_PER_YEAR;
  const ahead = data.notes.filter((n) => n.day > data.today).slice(0, 5);

  return (
    <>
      <section class="card life-card">
        <div class="row row--spread">
          <h2 class="card__title">Your life in weeks</h2>
          {!changing && (
            <button class="link-button" onClick={() => setChanging(true)}>
              Change
            </button>
          )}
        </div>
        {now && (
          <p class="life-stats">
            Week {lifeWeekNumber(now).toLocaleString()} of {total.toLocaleString()} · age {now.year}
          </p>
        )}
        {changing && <ProfileForm profile={data.profile} today={data.today} submit="Save" onDone={() => setChanging(false)} />}
        <LifeGrid data={data} onYear={(year) => route(`/self/year/${year}`)} />
        <LifeLegend />
        {now && now.year < data.profile.years && (
          <a class="btn btn--ghost btn--sm life-card__open" href={`/self/year/${now.year}`}>
            Open this year <ChevronIcon size={16} />
          </a>
        )}
      </section>

      <section class="section">
        <h2 class="section__title">Chapters</h2>
        {data.chapters.length > 0 && (
          <ul class="chapter-list">
            {data.chapters.map((c) =>
              chapterForm === c.id ? (
                <li>
                  <ChapterForm chapter={c} today={data.today} onDone={() => setChapterForm(null)} />
                </li>
              ) : (
                <li>
                  <button class="chapter-row" onClick={() => setChapterForm(c.id)}>
                    <span class={`chapter-row__swatch ch--${c.color}`} aria-hidden="true" />
                    <span class="chapter-row__title">{c.title}</span>
                    <span class="muted chapter-row__dates">{chapterDates(c)}</span>
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
        {chapterForm === 'new' ? (
          <ChapterForm today={data.today} onDone={() => setChapterForm(null)} />
        ) : (
          <button class="btn btn--ghost btn--sm" onClick={() => setChapterForm('new')}>
            <PlusIcon size={16} /> Add a chapter
          </button>
        )}
      </section>

      {ahead.length > 0 && (
        <section class="section">
          <h2 class="section__title">Ahead</h2>
          <ul class="life-notes">
            {ahead.map((n) => {
              const week = lifeWeekOf(data.profile.birthday, n.day);
              return (
                <li>
                  <a href={week ? `/self/year/${week.year}` : '/self'} class="life-note">
                    <span class="life-note__day">{shortDate(n.day)}</span>
                    <span>{n.text}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section class="card">
        <h2 class="card__title">Add a note</h2>
        <p class="muted">A moment worth remembering, or, on a day ahead, something you want to do.</p>
        <NoteForm day={data.today} min={data.profile.birthday} />
      </section>
    </>
  );
}
