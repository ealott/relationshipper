import { useLocation } from 'preact-iso';
import { api } from '../api';
import { ErrorNotice } from '../components/Feedback';
import { BackIcon, ChevronIcon, ShuffleIcon, TrashIcon } from '../components/Icons';
import { QuestionCard } from '../components/QuestionCard';
import { ResearchNote } from '../components/ResearchNote';
import { fitsCouple, randomFresh, useAvailableBank, useCatalog, useProgress, useToday } from '../lib/data';
import { invalidate, useQuery } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { NotFound } from './NotFound';

export function QuestionPage({ id }: { id: string }) {
  const me = useMe();
  const loaded = useQuery(`question:${id}`, () => api.question(id), { refreshInterval: 15_000 });
  const progress = useProgress().data?.progress;
  const today = useToday().data;
  const catalog = useCatalog();
  const available = useAvailableBank();
  const { route } = useLocation();

  if (loaded.error && !loaded.data) {
    return (loaded.error as { status?: number }).status === 404 ? <NotFound /> : <ErrorNotice error={loaded.error} onRetry={loaded.refresh} />;
  }
  const question = loaded.data?.question ?? catalog.byId.get(id);
  if (!question) return <main class="page" />;

  // Next unanswered question in this theme.
  const siblings = catalog.bank.filter((q) => q.category === question.category && fitsCouple(q, me.couple));
  const index = siblings.findIndex((q) => q.id === question.id);
  const next = [...siblings.slice(index + 1), ...siblings.slice(0, Math.max(0, index))].find(
    (q) => !progress?.[q.id] || progress[q.id] === 'partner',
  );
  const canDelete = question.source === 'custom' && question.authorId === me.user.id && !progress?.[question.id];

  async function remove() {
    if (!confirm('Delete this question?')) return;
    try {
      await api.deleteQuestion(question!.id);
      invalidate('custom-questions');
      toast('Question deleted.');
      route('/questions', true);
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <main class="page">
      <a
        href={question.category ? `/questions/${question.category}` : '/questions'}
        class="back-link"
        onClick={(e) => {
          if (history.length > 1) {
            e.preventDefault();
            history.back();
          }
        }}
      >
        <BackIcon size={18} /> Back
      </a>
      <QuestionCard
        question={question}
        state={loaded.data?.state}
        daily={today?.question.id === question.id}
        onChange={(state) => {
          loaded.mutate({ question, state });
          invalidate('today');
        }}
      />
      <div class="row row--spread">
        {next ? (
          <a class="btn btn--ghost" href={`/q/${next.id}`}>
            Next in this theme <ChevronIcon size={16} />
          </a>
        ) : (
          <span />
        )}
        <button
          class="btn btn--ghost"
          onClick={() => {
            const q = randomFresh(available, progress, question.id);
            if (q) route(`/q/${q.id}`);
          }}
        >
          <ShuffleIcon size={16} /> Another question
        </button>
      </div>
      {question.category && question.source !== 'custom' && <ResearchNote category={question.category} />}
      {canDelete && (
        <button class="link-button link-button--danger" onClick={remove}>
          <TrashIcon size={15} /> Delete this question
        </button>
      )}
    </main>
  );
}
