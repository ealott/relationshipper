import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { LIMITS } from '../../shared/api';
import { CATEGORIES } from '../../shared/categories';
import type { CategoryId } from '../../shared/questions/types';
import { api } from '../api';
import { AutoTextarea } from '../components/Field';
import { BackIcon } from '../components/Icons';
import { invalidate } from '../lib/query';
import { useMe } from '../lib/session';
import { toast } from '../lib/toast';

export function WriteQuestion() {
  const me = useMe();
  const { route } = useLocation();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<CategoryId | ''>('');
  const [suggest, setSuggest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const q = await api.createQuestion({ text, category: category || null, suggest });
      invalidate('custom-questions');
      toast(`Question added — ${me.partner?.name} will see it too.`);
      route(`/q/${q.id}`, true);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main class="page page--narrow">
      <a href="/questions" class="back-link">
        <BackIcon size={18} /> Questions
      </a>
      <h1 class="page__title">Ask your own question</h1>
      <p class="page__lede">
        You’ll both answer it, privately, just like the daily question — and it stays between the two of you.
      </p>
      <form class="card stack" onSubmit={submit}>
        <label class="field">
          <span class="field__label">Your question</span>
          <AutoTextarea
            value={text}
            onValue={setText}
            maxLength={LIMITS.questionMax}
            rows={3}
            placeholder={`What’s something you’ve wanted to ask ${me.partner?.name ?? 'your partner'}?`}
            required
          />
          <span class="field__hint">
            The best questions are open-ended and specific: they invite a story or a reason, not a yes or no.
          </span>
        </label>
        <label class="field">
          <span class="field__label">Theme (optional)</span>
          <select class="input" value={category} onChange={(e) => setCategory(e.currentTarget.value as CategoryId | '')}>
            <option value="">No theme</option>
            {CATEGORIES.filter((c) => !c.optIn || me.couple?.includeIntimacy).map((c) => (
              <option value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label class="checkbox">
          <input type="checkbox" checked={suggest} onChange={(e) => setSuggest(e.currentTarget.checked)} />
          <span>
            Also suggest it for everyone. Only the question’s wording is shared with the Relationshipper team for review — never your
            answers.
          </span>
        </label>
        {error && (
          <p class="form-error" role="alert">
            {error}
          </p>
        )}
        <button class="btn btn--primary btn--block" disabled={busy || text.trim().length < LIMITS.questionMin}>
          Add question
        </button>
      </form>
    </main>
  );
}
