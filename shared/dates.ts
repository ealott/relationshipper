// Date nights: a shared list of ideas, and the dates a couple plans from it, ahead of time.

export const DATE_LIMITS = { titleMax: 120, notesMax: 1000 } as const;

export type DateSetting = 'home' | 'out';

/** The morning reminder goes out from this local time (couple's time zone) on the day. */
export const DATE_REMINDER_MINUTES = 9 * 60;

/**
 * Ideas to start a list with. They lean toward new things to do together: in lab experiments,
 * couples who did a novel, challenging task together reported a short-term rise in relationship
 * quality (Aron et al., 2000; see docs/research.md).
 */
export const SUGGESTED_DATES: { title: string; setting: DateSetting }[] = [
  { title: 'Cook a dish from a country neither of you has visited', setting: 'home' },
  { title: 'Take a one-night class together: pottery, dancing, climbing', setting: 'out' },
  { title: 'Walk or hike a trail you haven’t tried', setting: 'out' },
  { title: 'Learn a new board or card game', setting: 'home' },
  { title: 'Go to a live show, a concert or a comedy night', setting: 'out' },
  { title: 'Try a cuisine you’ve never had', setting: 'out' },
  { title: 'Visit a museum or gallery you haven’t been to', setting: 'out' },
  { title: 'Have a picnic somewhere new', setting: 'out' },
  { title: 'Find somewhere dark and look at the stars', setting: 'out' },
  { title: 'Recreate your first date', setting: 'out' },
  { title: 'Volunteer together for an afternoon', setting: 'out' },
  { title: 'Make each other a playlist and listen together', setting: 'home' },
  { title: 'A phone-free dinner with a few questions from the app', setting: 'home' },
  { title: 'Ride bikes somewhere for breakfast', setting: 'out' },
  { title: 'Take a day trip to a town you’ve never visited', setting: 'out' },
  { title: 'Build a blanket fort and watch a film from the year you met', setting: 'home' },
];

/** "19:00" → "7:00 PM". */
export function formatClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h! % 12 || 12}:${String(m).padStart(2, '0')} ${h! < 12 ? 'AM' : 'PM'}`;
}
