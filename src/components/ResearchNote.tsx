import type { CategoryId } from '../../shared/questions/types';
import { CATEGORY_RESEARCH } from '../../shared/research';
import { BookIcon } from './Icons';
import { Sources } from './Sources';

export function ResearchNote({ category }: { category: CategoryId }) {
  const note = CATEGORY_RESEARCH[category];
  return (
    <details class="research-note">
      <summary>
        <BookIcon size={16} /> The research behind this theme
      </summary>
      <p>{note.summary}</p>
      <p class="strength">
        <strong>Evidence:</strong> {note.strength}
      </p>
      <Sources sources={note.sources} class="research-note__sources" />
      <a href="/research">More about the research</a>
    </details>
  );
}
