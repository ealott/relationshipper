export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minute = 60_000;
  if (diff < minute) return 'just now';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} min ago`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} h ago`;
  const days = Math.floor(diff / (24 * 60 * minute));
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Who's signed in: the email, or the name for name-and-password accounts. */
export const accountLabel = (user: { email: string; name: string }) => (user.email.includes('@') ? user.email : user.name);
