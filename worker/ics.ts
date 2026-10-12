import { addDays, zonedNow } from '../shared/time';

/** The UTC instant of a wall-clock time (`HH:MM` on `YYYY-MM-DD`) in a time zone. */
export function zonedTimeToUtc(day: string, time: string, timeZone: string): Date {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // How far the zone's clock is ahead of UTC at a given instant.
  const offset = (at: number) => {
    const z = zonedNow(timeZone, new Date(at));
    const [zy, zm, zd] = z.day.split('-').map(Number);
    return Date.UTC(zy!, zm! - 1, zd!, Math.floor(z.minutes / 60), z.minutes % 60) - at;
  };
  // Twice, so a guess on the far side of a daylight-saving change corrects itself.
  const first = wall - offset(wall);
  return new Date(wall - offset(first));
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Long lines are folded onto continuation lines that start with a space (RFC 5545). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

/** A one-event calendar file. With no time, it's an all-day event; with one, two hours long. */
export function calendarEvent(e: { uid: string; day: string; time: string | null; timeZone: string; title: string; notes: string; url: string }, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Relationshipper//Date nights//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp(now)}`];
  if (e.time) {
    const start = zonedTimeToUtc(e.day, e.time, e.timeZone);
    lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 2 * 60 * 60 * 1000))}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${e.day.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${addDays(e.day, 1).replaceAll('-', '')}`);
  }
  lines.push(`SUMMARY:${escape(`Date night: ${e.title}`)}`);
  if (e.notes) lines.push(`DESCRIPTION:${escape(e.notes)}`);
  lines.push(`URL:${e.url}`, 'END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
