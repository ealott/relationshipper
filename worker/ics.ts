import { addDays, zonedTimeToUtc } from '../shared/time';

export interface CalendarEventInput {
  uid: string;
  day: string;
  time: string | null;
  timeZone: string;
  title: string;
  notes: string;
  url: string;
  updatedAt?: number;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const utf8Length = (codePoint: number) => (codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4);

/**
 * Long lines are folded onto continuation lines that start with a space, at most 75 bytes each
 * (RFC 5545), never splitting a character.
 */
function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = utf8Length(ch.codePointAt(0)!);
    if (bytes + size > 75) {
      out.push(current);
      current = ' ';
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}

/** One event. With no time, it's an all-day event; with one, two hours long. */
function eventLines(e: CalendarEventInput, now: Date): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp(now)}`];
  if (e.updatedAt) lines.push(`LAST-MODIFIED:${stamp(new Date(e.updatedAt))}`);
  if (e.time) {
    const start = zonedTimeToUtc(e.day, e.time, e.timeZone);
    lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 2 * 60 * 60 * 1000))}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${e.day.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${addDays(e.day, 1).replaceAll('-', '')}`);
  }
  lines.push(`SUMMARY:${escape(`Date night: ${e.title}`)}`);
  if (e.notes) lines.push(`DESCRIPTION:${escape(e.notes)}`);
  lines.push(`URL:${e.url}`, 'END:VEVENT');
  return lines;
}

const calendar = (body: string[], header: string[] = []) =>
  `${['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Relationshipper//Date nights//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...header, ...body, 'END:VCALENDAR']
    .map(fold)
    .join('\r\n')}\r\n`;

/** A one-event calendar file, to add a single date to your phone's calendar. */
export function calendarEvent(e: CalendarEventInput, now = new Date()): string {
  return calendar(eventLines(e, now));
}

/**
 * A calendar to subscribe to: every date night, which calendar apps fetch again from time to time,
 * so changes and cancellations follow. The refresh hints are suggestions; Google checks less often.
 */
export function calendarFeed(name: string, events: CalendarEventInput[], now = new Date()): string {
  return calendar(
    events.flatMap((e) => eventLines(e, now)),
    [`X-WR-CALNAME:${escape(name)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'],
  );
}
