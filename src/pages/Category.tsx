import { useState } from 'preact/hooks';
import { CATEGORY_BY_ID, isCategoryId } from '../../shared/categories';
import { api } from '../api';
import { BackIcon } from '../components/Icons';
import { QuestionRow } from '../components/QuestionRow';
import { ResearchNote } from '../components/ResearchNote';
import { fitsCouple, progressStatus, STATUS_LABEL, useCatalog, useProgress, type Status } from '../lib/data';
import { setMe, useMe } from '../lib/session';
import { toastError } from '../lib/toast';
import { NotFound } from './NotFound';

const FILTERS: ('all' | Status)[] = ['all', 'new', 'your-turn', 'waiting', 'revealed'];

export function CategoryPage({ category: id }: { category: string }) {
  const me = useMe();
  const progress = useProgress().data?.progress;
  const catalog = useCatalog();
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [busy, setBusy] = useState(false);
  if (!isCategoryId(id)) return <NotFound />;
  const category = CATEGORY_BY_ID[id];

  const partnerName = me.partner!.name;
  // Questions that fit this couple, plus any they've already answered.
  const questions = catalog.bank.filter((q) => q.category === id && (fitsCouple(q, me.couple) || progress?.[q.id]));
  const shown = filter === 'all' ? questions : questions.filter((q) => progressStatus(progress, q.id) === filter);
  const locked = category.optIn && !me.couple?.includeIntimacy;
  const stageMissing = ['marriage', 'kids', 'home'].includes(id) && [me.couple?.married, me.couple?.livingTogether, me.couple?.hasKids].includes(null);

  async function optIn() {
    setBusy(true);
    try {
      setMe(await api.updateCouple({ includeIntimacy: true }));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="page" style={{ '--cat': category.color }}>
      <a href="/questions" class="back-link">
        <BackIcon size={18} /> All themes
      </a>
      <header class="category-hero">
        <h1 class="page__title">{category.name}</h1>
        <p class="page__lede">{category.description}</p>
      </header>
      <ResearchNote category={id} />

      {locked ? (
        <section class="card">
          <h2 class="card__title">This theme is off</h2>
          <p>
            These prompts explore desire, affection and physical closeness. Turning them on adds them to your library and daily questions —
            for both of you. Either of you can turn them off again in Settings.
          </p>
          <button class="btn btn--primary" onClick={optIn} disabled={busy}>
            Turn on intimacy questions
          </button>
        </section>
      ) : (
        <>
          {stageMissing && (
            <p class="callout">
              Tell us about your relationship stage in <a href="/settings">Settings</a> to see the questions in this theme that fit you.
            </p>
          )}
          <div class="filters" role="tablist" aria-label="Filter questions">
            {FILTERS.map((f) => (
              <button role="tab" aria-selected={filter === f} class="filter" onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
          {shown.length ? (
            <ul class="qlist">
              {shown.map((q) => (
                <QuestionRow question={q} status={progressStatus(progress, q.id)} partnerName={partnerName} />
              ))}
            </ul>
          ) : (
            <p class="empty">{catalog.loading ? 'Loading…' : 'Nothing here yet.'}</p>
          )}
        </>
      )}
    </main>
  );
}
