import type { Instrument } from '../../shared/api';
import { lifeWeekNumber, lifeWeekOf, WEEKS_PER_YEAR } from '../../shared/self';
import { ChevronIcon, PersonIcon, SlidersIcon, TimelineIcon, WavesIcon } from '../components/Icons';
import { useQuestionnaires, useSelf } from '../lib/data';
import { formatDate } from '../lib/format';
import { useMe } from '../lib/session';

/** What your partner has chosen to share with you, each on its own card. */
const PARTNER_CARDS: { instrument: Instrument; title: string; href: string; Icon: typeof PersonIcon }[] = [
  { instrument: 'big-five', title: 'personality', href: '/self/big-five#partner', Icon: PersonIcon },
  { instrument: 'check-in', title: 'check-in', href: '/self/check-in#partner', Icon: WavesIcon },
];

/** Self: a private place for knowing yourself. Each part opens from a card here. */
export function Self() {
  const me = useMe();
  const self = useSelf().data;
  const q = useQuestionnaires().data;
  const partnerName = me.partner?.name ?? 'your partner';
  const now = self?.profile ? lifeWeekOf(self.profile.birthday, self.today) : null;
  const latest = (instrument: Instrument) => q?.mine.find((r) => r.instrument === instrument);
  const sharing = (instrument: Instrument) => (q?.sharing.includes(instrument) ? `shared with ${partnerName}` : 'private');
  const theirs = (instrument: Instrument) => q?.partner.find((r) => r.instrument === instrument);
  const bigFive = latest('big-five');
  const checkIn = latest('check-in');
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
            {bigFive ? `The Big Five, from ${formatDate(bigFive.createdAt)} · ${sharing('big-five')}` : 'The Big Five: 50 short statements, about 8 minutes.'}
          </span>
        </span>
        <ChevronIcon size={18} />
      </a>

      <a class="card link-card self-card" href={q && !checkIn ? '/self/check-in/take' : '/self/check-in'}>
        <WavesIcon size={22} />
        <span class="link-card__text">
          <span class="link-card__title">How you’ve been</span>
          <span class="muted">
            {checkIn
              ? `Your check-in from ${formatDate(checkIn.createdAt)} · ${sharing('check-in')}`
              : 'A check-in on anxiety and mood: 15 questions about the last two weeks.'}
          </span>
        </span>
        <ChevronIcon size={18} />
      </a>

      {PARTNER_CARDS.map(({ instrument, title, href, Icon }) => {
        const shared = theirs(instrument);
        return (
          shared && (
            <a class="card link-card self-card" href={href}>
              <Icon size={22} />
              <span class="link-card__text">
                <span class="link-card__title">
                  {partnerName}’s {title}
                </span>
                <span class="muted">Shared with you, from {formatDate(shared.createdAt)}</span>
              </span>
              <ChevronIcon size={18} />
            </a>
          )
        );
      })}
    </main>
  );
}
