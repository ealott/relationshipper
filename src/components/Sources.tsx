import type { Source } from '../../shared/research';

/** APA references, each with its DOI (or library record) as a link. */
export function Sources({ sources, class: className = 'sources' }: { sources: Source[]; class?: string }) {
  if (!sources.length) return null;
  return (
    <ul class={className}>
      {sources.map((s) => (
        <li>
          {s.cite}{' '}
          <a href={s.url} target="_blank" rel="noopener noreferrer">
            {s.url.replace(/^https:\/\//, '')}
          </a>
        </li>
      ))}
    </ul>
  );
}
