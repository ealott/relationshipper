import type { DateNightDTO } from '../../shared/api';
import { addDays, zonedTimeToUtc } from '../../shared/time';

// Links into Google Calendar and Apple Calendar for date nights (#35).

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** A prefilled "Add to Google Calendar" event. It's a copy: later changes don't follow. */
export function googleEventUrl(date: DateNightDTO, timeZone: string, appUrl: string): string {
  let dates: string;
  if (date.time) {
    const start = zonedTimeToUtc(date.day, date.time, timeZone);
    dates = `${stamp(start)}/${stamp(new Date(start.getTime() + 2 * 60 * 60 * 1000))}`;
  } else {
    dates = `${date.day.replaceAll('-', '')}/${addDays(date.day, 1).replaceAll('-', '')}`;
  }
  const details = [date.notes, appUrl].filter(Boolean).join('\n\n');
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: `Date night: ${date.title}`, dates, details })}`;
}

/** Subscribing to the feed in Apple Calendar (and most calendar apps): the same link, as webcal://. */
export const webcalUrl = (feedUrl: string) => feedUrl.replace(/^https?:/, 'webcal:');

/** Subscribing in Google Calendar, which opens Google Calendar on the web to add it. */
export const googleSubscribeUrl = (feedUrl: string) => `https://www.google.com/calendar/render?cid=${webcalUrl(feedUrl)}`;
