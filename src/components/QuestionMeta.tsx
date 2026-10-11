import type { QuestionDTO } from '../../shared/api';
import { CATEGORY_BY_ID } from '../../shared/categories';
import { useMe } from '../lib/session';
import { BookIcon, PencilIcon, UsersIcon } from './Icons';

export function CategoryLabel({ question, link = true }: { question: QuestionDTO; link?: boolean }) {
  const category = question.category ? CATEGORY_BY_ID[question.category] : null;
  const label = category?.name ?? 'Your questions';
  const style = { '--cat': category?.color ?? 'var(--text-muted)' };
  return link && category ? (
    <a class="catlabel" href={`/questions/${category.id}`} style={style}>
      <span class="catlabel__dot" aria-hidden="true" />
      {label}
    </a>
  ) : (
    <span class="catlabel" style={style}>
      <span class="catlabel__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Distinguishes research-based prompts from questions people wrote. */
export function SourceBadge({ question }: { question: QuestionDTO }) {
  const me = useMe();
  if (question.source === 'research') {
    return (
      <span class="source source--research" title="From Relationshipper’s research-based question bank">
        <BookIcon size={13} /> Research-based
      </span>
    );
  }
  if (question.source === 'community') {
    return (
      <span class="source source--community" title="Suggested by a couple and reviewed for the question bank">
        <UsersIcon size={13} /> Community
      </span>
    );
  }
  const mine = question.authorId === me.user.id;
  return (
    <span class="source source--custom">
      <PencilIcon size={13} /> Written by {mine ? 'you' : (me.partner?.name ?? 'your partner')}
    </span>
  );
}
