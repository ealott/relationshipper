import { useLocation } from 'preact-iso';
import { CATEGORIES } from '../../shared/categories';
import { BookIcon, PencilIcon, ShuffleIcon } from '../components/Icons';
import { QuestionRow } from '../components/QuestionRow';
import { fitsCouple, progressStatus, randomFresh, useAvailableBank, useCatalog, useDrafts, useProgress } from '../lib/data';
import { useMe } from '../lib/session';

export function Library() {
  const me = useMe();
  const progress = useProgress().data?.progress;
  const catalog = useCatalog();
  const available = useAvailableBank();
  const { route } = useLocation();
  const partnerName = me.partner!.name;
  const count = (status: 'partner' | 'mine' | 'both') => Object.values(progress ?? {}).filter((v) => v === status).length;
  const drafts = useDrafts().items.length;

  return (
    <main class="page">
      <header class="page__header">
        <div>
          <h1 class="page__title">Questions</h1>
          <p class="page__lede">Research-based prompts, organized by what keeps relationships strong — plus the ones you write.</p>
        </div>
      </header>
      <nav class="answer-links" aria-label="Your answers">
        <a class={`answer-link${count('partner') ? ' answer-link--turn' : ''}`} href="/answers?tab=your-turn">
          <strong>{count('partner')}</strong> Your turn
        </a>
        <a class="answer-link" href="/answers?tab=waiting">
          <strong>{count('mine')}</strong> Waiting
        </a>
        <a class="answer-link" href="/answers">
          <strong>{count('both')}</strong> Shared
        </a>
        <a class="answer-link" href="/drafts">
          <strong>{drafts}</strong> {drafts === 1 ? 'Draft' : 'Drafts'}
        </a>
      </nav>
      <div class="row">
        <a class="btn btn--primary" href="/questions/new">
          <PencilIcon size={18} /> Write a question
        </a>
        <button
          class="btn btn--ghost"
          onClick={() => {
            const q = randomFresh(available, progress);
            if (q) route(`/q/${q.id}`);
          }}
        >
          <ShuffleIcon size={18} /> Pick one for us
        </button>
      </div>

      {catalog.custom.length > 0 && (
        <section class="section">
          <h2 class="section__title">Your questions</h2>
          <ul class="qlist">
            {catalog.custom.map((q) => (
              <QuestionRow question={q} status={progressStatus(progress, q.id)} partnerName={partnerName} />
            ))}
          </ul>
        </section>
      )}

      <section class="section">
        <h2 class="section__title">Themes</h2>
        <div class="themes">
          {CATEGORIES.map((c) => {
            const questions = catalog.bank.filter((q) => q.category === c.id && (fitsCouple(q, me.couple) || progress?.[q.id]));
            const shared = questions.filter((q) => progress?.[q.id] === 'both').length;
            const waiting = questions.filter((q) => progress?.[q.id] === 'partner').length;
            const locked = c.optIn && !me.couple?.includeIntimacy;
            return (
              <a class="theme" href={`/questions/${c.id}`} style={{ '--cat': c.color }}>
                <span class="theme__name">{c.name}</span>
                <span class="theme__desc">{c.description}</span>
                <span class="theme__meta">
                  {locked ? 'Off · opt in' : `${shared} of ${questions.length} shared`}
                  {waiting > 0 && <span class="theme__badge">{waiting} waiting for you</span>}
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <a class="research-link" href="/research">
        <BookIcon size={18} /> Why these questions? Read about the research
      </a>
    </main>
  );
}
