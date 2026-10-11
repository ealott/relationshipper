import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import type { HistoryItem, QuestionDTO } from '../../shared/api';
import { questionText } from '../../shared/categories';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { ErrorNotice, Spinner } from '../components/Feedback';
import { CategoryLabel } from '../components/QuestionMeta';
import { QuestionRow } from '../components/QuestionRow';
import { idsWithStatus, useCatalog, useProgress } from '../lib/data';
import { relativeTime } from '../lib/format';
import { useQuery } from '../lib/query';
import { useMe } from '../lib/session';

type Tab = 'revealed' | 'your-turn' | 'waiting';

export function Answers() {
  const me = useMe();
  const partnerName = me.partner!.name;
  const { query, route } = useLocation();
  const tab: Tab = query.tab === 'your-turn' || query.tab === 'waiting' ? query.tab : 'revealed';
  const progress = useProgress().data?.progress;
  const catalog = useCatalog();
  const lookup = (ids: string[]) => ids.map((id) => catalog.byId.get(id)).filter((q): q is QuestionDTO => Boolean(q));
  const yourTurn = lookup(idsWithStatus(progress, 'partner'));
  const waiting = lookup(idsWithStatus(progress, 'mine'));

  return (
    <main class="page">
      <header class="page__header">
        <div>
          <h1 class="page__title">Answers</h1>
          <p class="page__lede">Everything you and {partnerName} have written.</p>
        </div>
      </header>
      <div class="segmented" role="tablist">
        {(
          [
            ['revealed', 'Shared'],
            ['your-turn', `Your turn${yourTurn.length ? ` · ${yourTurn.length}` : ''}`],
            ['waiting', `Waiting${waiting.length ? ` · ${waiting.length}` : ''}`],
          ] as const
        ).map(([key, label]) => (
          <button role="tab" aria-selected={tab === key} onClick={() => route(key === 'revealed' ? '/answers' : `/answers?tab=${key}`, true)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'revealed' && <History />}
      {tab === 'your-turn' &&
        (yourTurn.length ? (
          <ul class="qlist">
            {yourTurn.map((q) => (
              <QuestionRow question={q} status="your-turn" partnerName={partnerName} />
            ))}
          </ul>
        ) : (
          <p class="empty">Nothing is waiting on you. When {partnerName} answers something first, it shows up here.</p>
        ))}
      {tab === 'waiting' &&
        (waiting.length ? (
          <ul class="qlist">
            {waiting.map((q) => (
              <QuestionRow question={q} status="waiting" partnerName={partnerName} />
            ))}
          </ul>
        ) : (
          <p class="empty">You’re all caught up. Questions you answer first wait here for {partnerName}.</p>
        ))}
    </main>
  );
}

function History() {
  const first = useQuery('history', () => api.history());
  const [more, setMore] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // A refreshed first page resets pagination.
  useEffect(() => {
    setMore([]);
    setCursor(first.data?.nextCursor ?? null);
  }, [first.data]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.history(cursor);
      setMore((m) => [...m, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  if (first.error && !first.data) return <ErrorNotice error={first.error} onRetry={first.refresh} />;
  if (!first.data) return <Spinner />;
  const items = [...first.data.items, ...more];
  if (!items.length) {
    return (
      <div class="empty">
        <p>Nothing shared yet. Once you’ve both answered a question, you can read each other’s answers here.</p>
        <a class="btn btn--primary" href="/">
          Answer today’s question
        </a>
      </div>
    );
  }
  return (
    <>
      <div class="history">
        {items.map((item) => (
          <HistoryCard item={item} />
        ))}
      </div>
      {cursor && (
        <button class="btn btn--ghost btn--block" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}

function HistoryCard({ item }: { item: HistoryItem }) {
  const me = useMe();
  const partnerName = me.partner!.name;
  const { question: q, state } = item;
  const replies = state.responses.length;
  return (
    <a class="hcard" href={`/q/${q.id}`}>
      <span class="hcard__top">
        <CategoryLabel question={q} link={false} />
        <time class="hcard__time">{relativeTime(state.revealedAt!)}</time>
      </span>
      <span class="hcard__q">{questionText(q, partnerName)}</span>
      <span class="hcard__answer">
        <Avatar name={partnerName} who="partner" size={22} />
        <span>{state.partner?.text}</span>
      </span>
      <span class="hcard__answer">
        <Avatar name={me.user.name} who="me" size={22} />
        <span>{state.mine?.text}</span>
      </span>
      <span class="hcard__foot">{replies ? `${replies} ${replies === 1 ? 'reply' : 'replies'}` : 'Start the conversation'}</span>
    </a>
  );
}
