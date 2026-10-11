import { useState } from 'preact/hooks';
import { api } from '../api';
import { getFlag, isIOS, setFlag } from '../lib/platform';
import { deviceSubscribed, enablePushOnDevice, pushSupport } from '../lib/push';
import { setMe, useMe } from '../lib/session';
import { useStore } from '../lib/store';
import { toast, toastError } from '../lib/toast';
import { BellIcon, ShareIcon } from './Icons';

/** Invites the user to turn on daily reminders (or explains how on iOS). */
export function ReminderPrompt() {
  const me = useMe();
  const subscribed = useStore(deviceSubscribed);
  const [dismissed, setDismissed] = useState(() => getFlag('reminder-prompt-dismissed') === '1');
  const [busy, setBusy] = useState(false);
  const support = pushSupport();

  if (dismissed || !me.vapidPublicKey || subscribed !== false) return null;
  if (support === 'unsupported') return null;
  if (support === 'supported' && Notification.permission === 'denied') return null;

  const dismiss = () => {
    setFlag('reminder-prompt-dismissed', '1');
    setDismissed(true);
  };

  if (support === 'needs-install') {
    return (
      <aside class="card prompt">
        <div class="prompt__icon">
          <BellIcon />
        </div>
        <div class="prompt__body">
          <h2 class="card__title">Want a daily reminder?</h2>
          <p>
            {isIOS() ? (
              <>
                Add Relationshipper to your Home Screen first: tap <ShareIcon size={15} /> <strong>Share</strong>, then{' '}
                <strong>Add to Home Screen</strong>. Open it from there to turn on reminders.
              </>
            ) : (
              'Install the app to turn on reminders.'
            )}
          </p>
          <button class="link-button" onClick={dismiss}>
            Not now
          </button>
        </div>
      </aside>
    );
  }

  async function enable() {
    setBusy(true);
    try {
      const permission = await enablePushOnDevice(me.vapidPublicKey!);
      if (permission === 'granted') {
        setMe(await api.updateMe({ reminderEnabled: true }));
        toast(`Reminders on — every day at ${me.user.reminderTime}. Change it in Settings.`);
      } else {
        toast('Notifications weren’t allowed. You can change that in your browser settings.', 'error');
      }
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside class="card prompt">
      <div class="prompt__icon">
        <BellIcon />
      </div>
      <div class="prompt__body">
        <h2 class="card__title">Never miss a day</h2>
        <p>Get a gentle reminder for the daily question, and a heads-up when {me.partner?.name} answers.</p>
        <div class="row">
          <button class="btn btn--primary btn--sm" onClick={enable} disabled={busy}>
            Turn on reminders
          </button>
          <button class="btn btn--ghost btn--sm" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    </aside>
  );
}
