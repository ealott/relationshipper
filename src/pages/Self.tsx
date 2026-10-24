import { lifeWeekNumber, lifeWeekOf, WEEKS_PER_YEAR } from '../../shared/self';
import { ChevronIcon, PersonIcon, SlidersIcon, TimelineIcon } from '../components/Icons';
import { useQuestionnaires, useSelf } from '../lib/data';
import { formatDate } from '../lib/format';
import { useMe } from '../lib/session';

/** Self: a private place for knowing yourself. Each part opens from a card here. */
export function Self() {
  const me = useMe();
  const self = useSelf().data;
  const q = useQuestionnaires().data;
  const partnerName = me.partner?.name ?? 'your partner';
  const now = self?.profile ? lifeWeekOf(self.profile.birthday, self.today) : null;
  const bigFive = q?.mine.find((r) => r.instrument === 'big-five');
  const shared = q?.sharing.includes('big-five');
  const theirs = q?.partner.find((r) => r.instrument === 'big-five');
  const ahead = self?.notes.filter((n) => n.day > self.today).length ?? 0;

  return (
    <main class="page">
      <header class="page__header">
        <div>
          <h1 class="page__title">Self</h1>
          <p class="page__lede">Just for you: {partnerName} only sees what you choose to share.</p>
        </div>
        <a class="btn btn--ghost btn--sm" href="/settings">
          <SlidersIcon size={16} /> Settings
        </a>
      </header>

      <a class="card link-card self-card" href="/self/life">
        <TimelineIcon size={22} />
        <span class="link-card__text">
          <span class="link-card__title">Your life in weeks</span>
          <span class="muted">
            {self?.profile && now
              ? `Week ${lifeWeekNumber(now).toLocaleString()} of ${(self.profile.years * WEEKS_PER_YEAR).toLocaleString()} · ${self.chapters.length} chapter${self.chapters.length === 1 ? '' : 's'}${ahead ? ` · ${ahead} ahead` : ''}`
              : 'A square for every week of your life, with its chapters, moments and plans.'}
          </span>
        </span>
        <ChevronIcon size={18} />
      </a>

      <a class="card link-card self-card" href={q && !bigFive ? '/self/big-five/take' : '/self/big-five'}>
        <PersonIcon size={22} />
        <span class="link-card__text">
          <span class="link-card__title">Your personality</span>
          <span class="muted">
            {bigFive
              ? `The Big Five, from ${formatDate(bigFive.createdAt)} · ${shared ? `shared with ${partnerName}` : 'private'}`
              : 'The Big Five: 50 short statements, about 8 minutes.'}
          </span>
        </span>
        <ChevronIcon size={18} />
      </a>

      {theirs && (
        <a class="card link-card self-card" href="/self/big-five#partner">
          <PersonIcon size={22} />
          <span class="link-card__text">
            <span class="link-card__title">{partnerName}’s personality</span>
            <span class="muted">Shared with you, from {formatDate(theirs.createdAt)}</span>
          </span>
          <ChevronIcon size={18} />
        </a>
      )}
    </main>
  );
}
