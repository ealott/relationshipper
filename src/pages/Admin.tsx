import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { LIMITS, type AdminQuestion, type AdminSuggestion } from '../../shared/api';
import { CATEGORIES, CATEGORY_BY_ID } from '../../shared/categories';
import type { Audience, CategoryId, Depth } from '../../shared/questions/types';
import { api, type AdminQuestionInput } from '../api';
import { ErrorNotice, Spinner } from '../components/Feedback';
import { AutoTextarea } from '../components/Field';
import { BackIcon } from '../components/Icons';
import { formatDate, relativeTime } from '../lib/format';
import { useQuery } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { NotFound } from './NotFound';

type Tab = 'overview' | 'questions' | 'suggestions' | 'users';
const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['questions', 'Questions'],
  ['suggestions', 'Suggestions'],
  ['users', 'Users'],
];
const AUDIENCES: [Audience | '', string][] = [
  ['', 'Everyone'],
  ['unmarried', 'Not married (hypothetical)'],
  ['married', 'Married'],
  ['no-kids', 'No kids (hypothetical)'],
  ['parents', 'Parents'],
  ['apart', 'Living apart (hypothetical)'],
  ['together', 'Living together'],
];
const DEPTHS: [Depth, string][] = [
  [1, '1 · Opener'],
  [2, '2 · Reflective'],
  [3, '3 · Deep'],
];

export function Admin() {
  const me = useMe();
  const { query, route } = useLocation();
  if (!me.user.isAdmin) return <NotFound />;
  const tab = (TABS.find(([t]) => t === query.tab)?.[0] ?? 'overview') as Tab;
  return (
    <main class="page page--wide">
      <a href="/settings" class="back-link">
        <BackIcon size={18} /> Settings
      </a>
      <header class="page__header">
        <div>
          <p class="eyebrow">Admin</p>
          <h1 class="page__title">Relationshipper console</h1>
          <p class="page__lede">Manage the shared question bank. Couples’ answers and conversations are private and never shown here.</p>
        </div>
      </header>
      <div class="segmented" role="tablist">
        {TABS.map(([t, label]) => (
          <button role="tab" aria-selected={tab === t} onClick={() => route(t === 'overview' ? '/admin' : `/admin?tab=${t}`, true)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'questions' && <Questions />}
      {tab === 'suggestions' && <Suggestions />}
      {tab === 'users' && <Users />}
    </main>
  );
}

function Overview() {
  const stats = useQuery('admin-stats', api.admin.stats, { refreshInterval: 60_000 });
  if (stats.error) return <ErrorNotice error={stats.error} onRetry={stats.refresh} />;
  if (!stats.data) return <Spinner />;
  const s = stats.data;
  const cards: [string, number | string][] = [
    ['People', s.users],
    ['Couples', s.couples],
    ['Active couples (7 days)', s.activeCouples7d],
    ['Answers written', s.answers],
    ['Answers (7 days)', s.answers7d],
    ['Responses', s.responses],
    ['Couple-written questions', s.customQuestions],
    ['Suggestions to review', s.pendingSuggestions],
    ['Devices with notifications', s.pushDevices],
    ['Bank: active / retired', `${s.bank.active} / ${s.bank.retired}`],
  ];
  return (
    <div class="stats">
      {cards.map(([label, value]) => (
        <div class="stat">
          <span class="stat__value">{value}</span>
          <span class="stat__label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function QuestionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Partial<AdminQuestion>;
  submitLabel: string;
  onSubmit: (input: AdminQuestionInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial.text ?? '');
  const [category, setCategory] = useState<CategoryId | ''>(initial.category ?? '');
  const [depth, setDepth] = useState<Depth>(initial.depth ?? 2);
  const [audience, setAudience] = useState<Audience | ''>(initial.audience ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <form
      class="stack admin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit({ text, category: category || undefined, depth, audience: audience || null });
        } catch (err) {
          toastError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <AutoTextarea value={text} onValue={setText} rows={2} maxLength={LIMITS.questionMax} aria-label="Question text" required />
      <div class="row toolbar">
        <select class="input input--grow" value={category} onChange={(e) => setCategory(e.currentTarget.value as CategoryId)} aria-label="Theme" required>
          <option value="">Theme…</option>
          {CATEGORIES.map((c) => (
            <option value={c.id}>{c.name}</option>
          ))}
        </select>
        <select class="input input--grow" value={depth} onChange={(e) => setDepth(Number(e.currentTarget.value) as Depth)} aria-label="Depth">
          {DEPTHS.map(([d, label]) => (
            <option value={d}>{label}</option>
          ))}
        </select>
        <select class="input input--grow" value={audience} onChange={(e) => setAudience(e.currentTarget.value as Audience | '')} aria-label="Audience">
          {AUDIENCES.map(([a, label]) => (
            <option value={a}>{label}</option>
          ))}
        </select>
      </div>
      <div class="row">
        <button class="btn btn--primary btn--sm" disabled={busy || !category || text.trim().length < LIMITS.questionMin}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" class="btn btn--ghost btn--sm" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Questions() {
  const list = useQuery('admin-questions', api.admin.questions);
  const [category, setCategory] = useState<CategoryId | ''>('');
  const [status, setStatus] = useState<'active' | 'retired' | ''>('active');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  if (list.error) return <ErrorNotice error={list.error} onRetry={list.refresh} />;
  if (!list.data) return <Spinner />;
  const needle = search.trim().toLowerCase();
  const shown = list.data.questions.filter(
    (q) => (!category || q.category === category) && (!status || q.status === status) && (!needle || q.text.toLowerCase().includes(needle) || q.id.includes(needle)),
  );

  return (
    <section class="stack">
      <div class="row toolbar">
        <input class="input input--grow input--wide" placeholder="Search questions" value={search} onInput={(e) => setSearch(e.currentTarget.value)} aria-label="Search" />
        <select class="input input--grow" value={category} onChange={(e) => setCategory(e.currentTarget.value as CategoryId | '')} aria-label="Theme filter">
          <option value="">All themes</option>
          {CATEGORIES.map((c) => (
            <option value={c.id}>{c.name}</option>
          ))}
        </select>
        <select class="input input--grow" value={status} onChange={(e) => setStatus(e.currentTarget.value as 'active' | 'retired' | '')} aria-label="Status filter">
          <option value="active">Active</option>
          <option value="retired">Retired</option>
          <option value="">All</option>
        </select>
        <button class="btn btn--primary btn--sm" onClick={() => setAdding(!adding)}>
          {adding ? 'Close' : 'Add question'}
        </button>
      </div>
      {adding && (
        <div class="card">
          <QuestionForm
            initial={{ category: category || undefined }}
            submitLabel="Add to bank"
            onSubmit={async (input) => {
              const { id } = await api.admin.createQuestion(input);
              toast(`Added ${id}`);
              setAdding(false);
              await list.refresh();
            }}
          />
        </div>
      )}
      <p class="muted">{shown.length} questions</p>
      <ul class="admin-list">
        {shown.map((q) => (
          <li class={`admin-item${q.status === 'retired' ? ' is-retired' : ''}`}>
            {editing === q.id ? (
              <QuestionForm
                initial={q}
                submitLabel="Save"
                onCancel={() => setEditing(null)}
                onSubmit={async (input) => {
                  await api.admin.updateQuestion(q.id, input);
                  setEditing(null);
                  await list.refresh();
                }}
              />
            ) : (
              <>
                <p class="admin-item__text">{q.text}</p>
                <p class="admin-item__meta">
                  <span class="mono">{q.id}</span> · {q.category ? CATEGORY_BY_ID[q.category].name : '—'} · depth {q.depth}
                  {q.audience && ` · ${AUDIENCES.find(([a]) => a === q.audience)?.[1]}`} · {q.source} · {q.answerCount} answers
                </p>
                <div class="row">
                  <button class="btn btn--ghost btn--sm" onClick={() => setEditing(q.id)}>
                    Edit
                  </button>
                  <button
                    class="btn btn--ghost btn--sm"
                    onClick={async () => {
                      try {
                        await api.admin.updateQuestion(q.id, { status: q.status === 'active' ? 'retired' : 'active' });
                        await list.refresh();
                      } catch (err) {
                        toastError(err);
                      }
                    }}
                  >
                    {q.status === 'active' ? 'Retire' : 'Restore'}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Suggestions() {
  const [status, setStatus] = useState<AdminSuggestion['status']>('pending');
  const list = useQuery(`admin-suggestions:${status}`, () => api.admin.suggestions(status));
  const [reviewing, setReviewing] = useState<string | null>(null);
  if (list.error) return <ErrorNotice error={list.error} onRetry={list.refresh} />;
  return (
    <section class="stack">
      <div class="filters" role="tablist">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button role="tab" aria-selected={status === s} class="filter" onClick={() => setStatus(s)}>
            {s[0]!.toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {!list.data ? (
        <Spinner />
      ) : !list.data.suggestions.length ? (
        <p class="empty">No {status} suggestions.</p>
      ) : (
        <ul class="admin-list">
          {list.data.suggestions.map((s) => (
            <li class="admin-item">
              <p class="admin-item__text">{s.text}</p>
              <p class="admin-item__meta">
                {s.authorName ?? 'Deleted user'} · {relativeTime(s.createdAt)}
                {s.category && ` · suggested theme: ${CATEGORY_BY_ID[s.category].name}`}
                {s.questionId && ` · added as ${s.questionId}`}
              </p>
              {status === 'pending' &&
                (reviewing === s.id ? (
                  <QuestionForm
                    initial={{ text: s.text, category: s.category ?? undefined }}
                    submitLabel="Approve into bank"
                    onCancel={() => setReviewing(null)}
                    onSubmit={async (input) => {
                      const { id } = await api.admin.approve(s.id, input);
                      toast(`Approved as ${id}`);
                      setReviewing(null);
                      await list.refresh();
                    }}
                  />
                ) : (
                  <div class="row">
                    <button class="btn btn--primary btn--sm" onClick={() => setReviewing(s.id)}>
                      Review & approve
                    </button>
                    <button
                      class="btn btn--ghost btn--sm"
                      onClick={async () => {
                        try {
                          await api.admin.reject(s.id);
                          await list.refresh();
                        } catch (err) {
                          toastError(err);
                        }
                      }}
                    >
                      Reject
                    </button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Users() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const list = useQuery(`admin-users:${submitted}`, () => api.admin.users(submitted));
  return (
    <section class="stack">
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(search.trim());
        }}
      >
        <input class="input input--grow" placeholder="Search by name or email" value={search} onInput={(e) => setSearch(e.currentTarget.value)} aria-label="Search users" />
        <button class="btn btn--ghost btn--sm">Search</button>
      </form>
      {list.error ? (
        <ErrorNotice error={list.error} onRetry={list.refresh} />
      ) : !list.data ? (
        <Spinner />
      ) : (
        <ul class="admin-list">
          {list.data.users.map((u) => (
            <li class="admin-item admin-item--row">
              <div>
                <p class="admin-item__text">{u.name}</p>
                <p class="admin-item__meta">
                  {u.email} · joined {formatDate(u.createdAt)} · {u.lastSeenAt ? `seen ${relativeTime(u.lastSeenAt)}` : 'not seen yet'} ·{' '}
                  {u.paired ? 'paired' : 'not paired'}
                </p>
              </div>
              <button
                class="btn btn--danger-ghost btn--sm"
                onClick={async () => {
                  if (!confirm(`Delete ${u.name} (${u.email})? This also deletes their couple’s shared data.`)) return;
                  try {
                    await api.admin.deleteUser(u.id);
                    toast('User deleted.');
                    await list.refresh();
                  } catch (err) {
                    toastError(err);
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
