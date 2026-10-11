import { CATEGORY_BY_ID, isCategoryId, questionText } from '../shared/categories';
import { findQuestions } from './questions';
import { getQuestionStates } from './questionState';
import type { PairedContext } from './session';

/**
 * The couple's journal as a readable Markdown file: every question either of you has answered,
 * both answers and the replies, oldest first. It follows the app's rule: your partner's answer
 * only appears once you've written yours.
 */
export async function exportJournal(db: D1Database, auth: PairedContext, now = Date.now()): Promise<string> {
  const { user, partner, couple } = auth;
  const { results } = await db
    .prepare('SELECT question_id, MIN(created_at) AS first FROM answers WHERE couple_id = ? GROUP BY question_id ORDER BY first')
    .bind(couple.id)
    .all<{ question_id: string; first: number }>();
  const ids = results.map((r) => r.question_id);
  const [questions, states] = await Promise.all([findQuestions(db, ids, couple.id), getQuestionStates(db, couple.id, user.id, ids)]);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: couple.timezone, dateStyle: 'long' });
  const nameOf = (id: string | null) => (id === user.id ? user.name : id === partner.id ? partner.name : null);

  const lines = [
    `# ${user.name} & ${partner.name}: our Relationshipper journal`,
    '',
    `Exported by ${user.name} on ${date.format(now)}. ${ids.length} question${ids.length === 1 ? '' : 's'}.`,
    '',
  ];
  states.forEach((state, i) => {
    const q = questions.get(state.questionId);
    if (!q) return;
    const theme = q.category && isCategoryId(q.category) ? CATEGORY_BY_ID[q.category].name : null;
    const source = q.source === 'custom' ? `Written by ${nameOf(q.author_id) ?? 'one of you'}` : q.source === 'community' ? 'Community' : 'Research-based';
    lines.push('---', '', `## ${questionText(q, partner.name)}`, '', [theme, source, `first answered ${date.format(results[i]!.first)}`].filter(Boolean).join(' · '), '');
    lines.push(`### ${user.name}`, '', state.mine?.text ?? '_Not answered yet._', '');
    lines.push(
      `### ${partner.name}`,
      '',
      state.partner?.text ?? (state.partnerAnswered ? '_Answered. It appears here once you’ve written yours._' : '_Not answered yet._'),
      '',
    );
    if (state.responses.length) {
      lines.push('### Replies', '');
      for (const r of state.responses) lines.push(`**${nameOf(r.userId) ?? 'Someone'}**, ${date.format(r.createdAt)}`, '', r.text, '');
    }
  });
  return lines.join('\n');
}
