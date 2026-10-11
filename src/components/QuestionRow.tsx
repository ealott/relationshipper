import type { QuestionDTO } from '../../shared/api';
import { CATEGORY_BY_ID, questionText } from '../../shared/categories';
import { STATUS_LABEL, type Status } from '../lib/data';

export function StatusChip({ status }: { status: Status }) {
  return <span class={`status status--${status}`}>{STATUS_LABEL[status]}</span>;
}

export function QuestionRow({ question, status, partnerName }: { question: QuestionDTO; status: Status; partnerName: string }) {
  const color = question.category ? CATEGORY_BY_ID[question.category].color : 'var(--text-muted)';
  return (
    <li>
      <a class="qrow" href={`/q/${question.id}`} style={{ '--cat': color }}>
        <span class="qrow__bar" aria-hidden="true" />
        <span class="qrow__text">
          {questionText(question, partnerName)}
          {question.source === 'custom' && <span class="qrow__note">Your question</span>}
        </span>
        {status !== 'new' && <StatusChip status={status} />}
      </a>
    </li>
  );
}
