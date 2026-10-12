import { useLocation } from 'preact-iso';
import { CardsIcon, ChatIcon, NotebookIcon, SlidersIcon, SunIcon } from './Icons';

const TABS = [
  { href: '/', label: 'Today', Icon: SunIcon, match: (p: string) => p === '/' || p === '/today' },
  { href: '/questions', label: 'Questions', Icon: CardsIcon, match: (p: string) => p.startsWith('/questions') || p.startsWith('/q/') },
  { href: '/journal', label: 'Journal', Icon: NotebookIcon, match: (p: string) => p.startsWith('/journal') },
  { href: '/answers', label: 'Answers', Icon: ChatIcon, match: (p: string) => p.startsWith('/answers') },
  { href: '/settings', label: 'Settings', Icon: SlidersIcon, match: (p: string) => p.startsWith('/settings') },
];

export function TabBar({ badges = {} }: { badges?: Record<string, number> }) {
  const { path } = useLocation();
  return (
    <nav class="tabbar" aria-label="Main">
      {TABS.map(({ href, label, Icon, match }) => {
        const active = match(path);
        const badge = badges[href] ?? 0;
        return (
          <a
            href={href}
            class={`tabbar__tab${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={badge > 0 ? `${label}, ${badge} waiting for you` : undefined}
          >
            <span class="tabbar__icon">
              <Icon size={24} />
              {badge > 0 && (
                <span class="tabbar__badge" aria-hidden="true">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
            <span class="tabbar__label">{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
