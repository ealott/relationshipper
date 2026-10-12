import type { VersionDTO } from '../shared/api';
import { CATEGORY_BY_ID, isCategoryId, questionText } from '../shared/categories';
import { formatClock } from '../shared/dates';
import { isWeeklyDay, JOURNAL_PROMPTS, JOURNAL_PREFIX, parseEntry } from '../shared/journal';
import { journalDayOf } from './journal';
import { findQuestions } from './questions';
import { getQuestionStates, getVersions } from './questionState';
import type { PairedContext } from './session';

/**
 * The couple's journal as a readable Markdown file: every question either of you has answered,
 * both answers and the replies (with any earlier versions), oldest first, then the journal days
 * and the date nights.
 * It follows the app's rule: your partner's answer only appears once you've written yours.
 */
export async function exportJournal(db: D1Database, auth: PairedContext, now = Date.now()): Promise<string> {
  const { user, partner, couple } = auth;
  const { results } = await db
    .prepare(
      `SELECT question_id, MIN(created_at) AS first, question_id LIKE ?2 AS journal FROM answers
        WHERE couple_id = ?1 GROUP BY question_id
        ORDER BY question_id LIKE ?2, CASE WHEN question_id LIKE ?2 THEN question_id END, first`,
    )
    .bind(couple.id, `${JOURNAL_PREFIX}%`)
    .all<{ question_id: string; first: number; journal: number }>();
  const ids = results.map((r) => r.question_id);
  const [questions, states] = await Promise.all([findQuestions(db, ids, couple.id), getQuestionStates(db, couple.id, user.id, ids)]);
  const versions = await getVersions(db, couple.id, states);
  const dayCount = results.filter((r) => r.journal).length;
  const date = new Intl.DateTimeFormat('en-US', { timeZone: couple.timezone, dateStyle: 'long' });
  const nameOf = (id: string | null) => (id === user.id ? user.name : id === partner.id ? partner.name : null);
  const earlier = (list: VersionDTO[] | undefined, render = (text: string) => text.split('\n')) =>
    list?.length
      ? [`_Edited. Earlier version${list.length === 1 ? '' : 's'}:_`, '', ...list.flatMap((v) => [`> _${date.format(v.writtenAt)}_`, '>', ...render(v.text).map((l) => (l ? `> ${l}` : '>')), ''])]
      : [];
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'full' });
  const entry = (text: string, weekly: boolean) => {
    const e = parseEntry(text);
    const out: string[] = [];
    for (const p of JOURNAL_PROMPTS) if (e[p.key].length) out.push(`**${p.heading}**`, ...e[p.key].map((l) => `- ${l}`), '');
    if (e.note) out.push(...(weekly ? ['**The week**'] : []), ...e.note.split('\n'), '');
    return out;
  };

  const lines = [
    `# ${user.name} & ${partner.name}: our Relationshipper journal`,
    '',
    `Exported by ${user.name} on ${date.format(now)}. ${ids.length - dayCount} question${ids.length - dayCount === 1 ? '' : 's'}, ${dayCount} journal day${dayCount === 1 ? '' : 's'}.`,
    '',
  ];
  states.forEach((state, i) => {
    const q = questions.get(state.questionId);
    if (!q) return;
    if (q.source === 'journal') {
      const d = journalDayOf(q.id);
      const weekly = isWeeklyDay(d);
      const v = versions.get(state.questionId);
      if (results[i - 1]?.journal !== 1) lines.push('---', '', '# Our days', '');
      lines.push(`## ${day.format(new Date(`${d}T12:00:00Z`))}`, '');
      lines.push(`### ${user.name}`, '', ...(state.mine ? entry(state.mine.text, weekly) : ['_Not written._', '']), ...earlier(v?.answers[user.id], (t) => entry(t, weekly)));
      lines.push(
        `### ${partner.name}`,
        '',
        ...(state.partner ? entry(state.partner.text, weekly) : [state.partnerAnswered ? '_Written. It appears here once you’ve written yours._' : '_Not written._', '']),
        ...earlier(v?.answers[partner.id], (t) => entry(t, weekly)),
      );
      if (state.responses.length) {
        lines.push('### Replies', '');
        for (const r of state.responses) {
          lines.push(`**${nameOf(r.userId) ?? 'Someone'}**, ${date.format(r.createdAt)}`, '', r.text, '', ...earlier(v?.responses[r.id]));
        }
      }
      return;
    }
    const theme = q.category && isCategoryId(q.category) ? CATEGORY_BY_ID[q.category].name : null;
    const source = q.source === 'custom' ? `Written by ${nameOf(q.author_id) ?? 'one of you'}` : q.source === 'community' ? 'Community' : 'Research-based';
    lines.push('---', '', `## ${questionText(q, partner.name)}`, '', [theme, source, `first answered ${date.format(results[i]!.first)}`].filter(Boolean).join(' · '), '');
    const v = versions.get(state.questionId);
    lines.push(`### ${user.name}`, '', state.mine?.text ?? '_Not answered yet._', '', ...earlier(v?.answers[user.id]));
    lines.push(
      `### ${partner.name}`,
      '',
      state.partner?.text ?? (state.partnerAnswered ? '_Answered. It appears here once you’ve written yours._' : '_Not answered yet._'),
      '',
      ...earlier(v?.answers[partner.id]),
    );
    if (state.responses.length) {
      lines.push('### Replies', '');
      for (const r of state.responses) {
        lines.push(`**${nameOf(r.userId) ?? 'Someone'}**, ${date.format(r.createdAt)}`, '', r.text, '', ...earlier(v?.responses[r.id]));
      }
    }
  });
  const { results: dates } = await db
    .prepare('SELECT day, start_time, title, notes, planner_id FROM date_nights WHERE couple_id = ? ORDER BY day, start_time')
    .bind(couple.id)
    .all<{ day: string; start_time: string | null; title: string; notes: string; planner_id: string | null }>();
  if (dates.length) {
    lines.push('---', '', '# Date nights', '');
    for (const d of dates) {
      const when = `${day.format(new Date(`${d.day}T12:00:00Z`))}${d.start_time ? `, ${formatClock(d.start_time)}` : ''}`;
      const who = d.planner_id ? `${nameOf(d.planner_id) ?? 'One of you'} planned it` : 'planned together';
      lines.push(`- **${when}**: ${d.title} (${who})`, ...d.notes.split('\n').filter(Boolean).map((l) => `  ${l}`));
    }
    lines.push('');
  }
  return lines.join('\n');
}
