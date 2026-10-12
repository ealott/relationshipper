import { useState } from 'preact/hooks';
import { api } from '../api';
import { googleSubscribeUrl, webcalUrl } from '../lib/calendar';
import { relativeTime } from '../lib/format';
import { useQuery } from '../lib/query';
import { toast, toastError } from '../lib/toast';
import { CalendarIcon, CopyIcon, LockIcon } from './Icons';

/**
 * On Date nights: your private calendar feed, to subscribe to once in Google Calendar or Apple
 * Calendar. Plans, changes and cancellations then follow on their own.
 */
export function CalendarFeedCard() {
  const feed = useQuery('calendar-feed', api.calendarFeed);
  const [open, setOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const data = feed.data;
  if (!data) return null;
  const url = data.url;

  async function start(renew = false) {
    if (renew && !confirm('Make a new link? Calendars using the old one stop updating until you subscribe with the new one.')) return;
    setBusy(true);
    try {
      feed.mutate(await api.startCalendarFeed());
      setOpen(true);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!confirm('Turn off your calendar link? Your calendars stop updating, and you can remove “Date nights” from them.')) return;
    setBusy(true);
    try {
      await api.stopCalendarFeed();
      feed.mutate({ url: null, fetchedAt: null });
      toast('Calendar link turned off.');
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      toast('Link copied.');
    } catch {
      toast('Couldn’t copy it. Press and hold the link to copy it yourself.');
    }
  }

  if (!url) {
    return (
      <section class="card link-card feed-card">
        <CalendarIcon size={22} />
        <span class="link-card__text">
          <span class="link-card__title">Put date nights in your calendar</span>
          <span class="muted">Google Calendar or Apple Calendar, kept up to date as you plan, move or cancel them.</span>
        </span>
        <button class="btn btn--ghost btn--sm" disabled={busy} onClick={() => start()}>
          Set up
        </button>
      </section>
    );
  }

  // Open until a calendar has fetched it; after that, tucked away.
  const showing = open ?? !data.fetchedAt;
  return (
    <section class="card feed-card">
      <div class="feed-card__head">
        <CalendarIcon size={22} />
        <span class="link-card__text">
          <span class="link-card__title">Date nights in your calendar</span>
          <span class="muted">{data.fetchedAt ? `Your calendar last checked ${relativeTime(data.fetchedAt)}.` : 'Subscribe once, with one of these.'}</span>
        </span>
        <button class="link-button" aria-expanded={showing} onClick={() => setOpen(!showing)}>
          {showing ? 'Hide' : 'Show'}
        </button>
      </div>
      {showing && (
        <>
          <div class="row">
            <a class="btn btn--primary btn--sm" href={webcalUrl(url)}>
              Subscribe in Apple Calendar
            </a>
            <a class="btn btn--ghost btn--sm" href={googleSubscribeUrl(url)} target="_blank" rel="noopener noreferrer">
              Subscribe in Google Calendar
            </a>
          </div>
          <p class="field__hint">
            Google Calendar adds it from its website, best on a computer, and can take up to a day to show a change. Or paste the link into any calendar app that can subscribe by URL.
          </p>
          <div class="feed-card__url">
            <input class="input" readOnly value={url} aria-label="Your calendar link" onFocus={(e) => e.currentTarget.select()} />
            <button class="btn btn--ghost btn--sm" onClick={copy}>
              <CopyIcon size={16} /> Copy
            </button>
          </div>
          <p class="hint">
            <LockIcon size={14} /> Anyone with this link can see your date nights and their notes, and your calendar app keeps a copy. It’s yours alone;
            your partner can set up their own.
          </p>
          <div class="row">
            <button class="link-button" disabled={busy} onClick={() => start(true)}>
              New link
            </button>
            <button class="link-button link-button--danger" disabled={busy} onClick={stop}>
              Turn off
            </button>
          </div>
        </>
      )}
    </section>
  );
}
