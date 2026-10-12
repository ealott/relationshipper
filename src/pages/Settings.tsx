import { useEffect, useState } from 'preact/hooks';
import { LIMITS, type CoupleStage } from '../../shared/api';
import { api, JOURNAL_EXPORT_URL } from '../api';
import { CoupleAvatars } from '../components/Avatar';
import { Segmented, Switch } from '../components/Field';
import { InstallSteps } from '../components/Install';
import { BookIcon, DownloadIcon, ShareIcon, ShieldIcon } from '../components/Icons';
import { StageFields } from './Stage';
import { useBootyCalls } from '../lib/data';
import { isStandalone } from '../lib/platform';
import { getPref, setPref, type Prefs } from '../lib/prefs';
import { checkDeviceSubscription, deviceSubscribed, disablePushOnDevice, enablePushOnDevice, pushSupport } from '../lib/push';
import { invalidate } from '../lib/query';
import { setMe, signedOut, useMe } from '../lib/session';
import { useStore } from '../lib/store';
import { accountLabel } from '../lib/format';
import { toast, toastError } from '../lib/toast';

export async function signOut() {
  await disablePushOnDevice().catch(() => {});
  await api.logout();
  signedOut();
  history.replaceState(null, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function timeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    // Older browsers: offer the current and device zones only.
  }
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set([current, device, ...zones])].sort();
}

export function Settings() {
  const me = useMe();
  const partnerName = me.partner!.name;
  const [saving, setSaving] = useState(false);

  async function update(fn: () => Promise<typeof me>, success?: string) {
    setSaving(true);
    try {
      setMe(await fn());
      if (success) toast(success);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main class="page">
      <header class="page__header">
        <div>
          <h1 class="page__title">Settings</h1>
        </div>
      </header>

      <InstallApp />

      <section class="card couple-card">
        <CoupleAvatars me={me.user.name} partner={partnerName} />
        <div>
          <p class="couple-card__names">
            {me.user.name} & {partnerName}
          </p>
          <p class="muted">
            Together on Relationshipper since{' '}
            {new Date(me.couple!.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </section>

      <Relationship saving={saving} update={update} />

      <Notifications saving={saving} update={update} />

      <Appearance />

      <section class="card settings">
        <a class="setting setting--link" href="/research">
          <span class="setting__text">
            <span class="setting__label">
              <BookIcon size={16} /> The research behind Relationshipper
            </span>
            <span class="setting__hint">How the questions and the daily ritual are grounded in relationship science.</span>
          </span>
        </a>
        {me.user.isAdmin && (
          <a class="setting setting--link" href="/admin">
            <span class="setting__text">
              <span class="setting__label">
                <ShieldIcon size={16} /> Admin console
              </span>
              <span class="setting__hint">Question bank, suggestions and usage.</span>
            </span>
          </a>
        )}
      </section>

      <Profile />
      <Journal />
      <Account />
    </main>
  );
}

function Notifications({ saving, update }: { saving: boolean; update: (fn: () => Promise<ReturnType<typeof useMe>>, success?: string) => Promise<void> }) {
  const me = useMe();
  const subscribed = useStore(deviceSubscribed);
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(me.user.reminderTime);
  const support = pushSupport();
  const configured = Boolean(me.vapidPublicKey);
  const denied = support === 'supported' && Notification.permission === 'denied';

  useEffect(() => {
    void checkDeviceSubscription();
  }, []);
  useEffect(() => setTime(me.user.reminderTime), [me.user.reminderTime]);

  async function enableDevice(): Promise<boolean> {
    setBusy(true);
    try {
      const permission = await enablePushOnDevice(me.vapidPublicKey!);
      if (permission !== 'granted') {
        toast('Notifications weren’t allowed. You can change that in your browser settings.', 'error');
        return false;
      }
      return true;
    } catch (err) {
      toastError(err);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    try {
      const { delivered } = await api.pushTest();
      toast(delivered ? 'Test notification sent' : 'No devices are set up for notifications yet.');
    } catch (err) {
      toastError(err);
    }
  }

  let device;
  if (!configured) device = <p class="muted">Notifications aren’t set up on this server yet (missing VAPID keys).</p>;
  else if (support === 'needs-install')
    device = (
      <p class="muted">
        On iPhone and iPad, add Relationshipper to your Home Screen (tap <ShareIcon size={14} /> Share → Add to Home Screen), then open
        it from there to turn on notifications.
      </p>
    );
  else if (support === 'unsupported') device = <p class="muted">This browser doesn’t support notifications.</p>;
  else if (denied) device = <p class="muted">Notifications are blocked for this site. Allow them in your browser’s site settings.</p>;
  else if (subscribed)
    device = (
      <div class="row row--spread">
        <span class="ok">✓ On for this device</span>
        <button class="btn btn--ghost btn--sm" onClick={test}>
          Send a test
        </button>
      </div>
    );
  else
    device = (
      <button class="btn btn--primary btn--sm" onClick={enableDevice} disabled={busy}>
        Turn on for this device
      </button>
    );

  const canToggle = configured && !saving;
  return (
    <section class="card settings">
      <h2 class="card__title">Notifications</h2>
      <div class="setting setting--stacked">{device}</div>
      <div class="setting">
        <div class="setting__text">
          <span class="setting__label">Daily reminder</span>
          <span class="setting__hint">If you haven’t answered today’s question yet.</span>
        </div>
        <Switch
          label="Daily reminder"
          checked={me.user.reminderEnabled}
          disabled={!canToggle}
          onChange={async (v) => {
            if (v && support === 'supported' && !subscribed && !(await enableDevice())) return;
            await update(() => api.updateMe({ reminderEnabled: v }));
          }}
        />
      </div>
      {me.user.reminderEnabled && (
        <div class="setting">
          <span class="setting__label">Remind me at</span>
          <input
            type="time"
            class="input input--time"
            value={time}
            disabled={!canToggle}
            onInput={(e) => setTime(e.currentTarget.value)}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (/^\d\d:\d\d$/.test(v) && v !== me.user.reminderTime) {
                void update(() => api.updateMe({ reminderTime: v, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }), `Reminder set for ${v}`);
              }
            }}
          />
        </div>
      )}
      <div class="setting">
        <div class="setting__text">
          <span class="setting__label">When {me.partner!.name} writes</span>
          <span class="setting__hint">Answers, replies, journal days and your timeline.</span>
        </div>
        <Switch
          label={`Notify me when ${me.partner!.name} writes`}
          checked={me.user.notifyPartner}
          disabled={!canToggle}
          onChange={(v) => update(() => api.updateMe({ notifyPartner: v }))}
        />
      </div>
      <div class="setting">
        <div class="setting__text">
          <span class="setting__label">Date nights</span>
          <span class="setting__hint">When {me.partner!.name} plans or changes one, and a reminder on the day.</span>
        </div>
        <Switch
          label="Date night notifications"
          checked={me.user.notifyDates}
          disabled={!canToggle}
          onChange={(v) => update(() => api.updateMe({ notifyDates: v }))}
        />
      </div>
      <div class="setting">
        <div class="setting__text">
          <span class="setting__label">Snuggles</span>
          <span class="setting__hint">When {me.partner!.name} sends you one.</span>
        </div>
        <Switch
          label="Snuggle notifications"
          checked={me.user.notifySnuggles}
          disabled={!canToggle}
          onChange={(v) => update(() => api.updateMe({ notifySnuggles: v }))}
        />
      </div>
    </section>
  );
}

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

const TEXT_SIZES = [
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
  { value: 'larger', label: 'Larger' },
] as const;

const MOTION = [
  { value: 'system', label: 'System' },
  { value: 'full', label: 'Full' },
  { value: 'reduced', label: 'Reduced' },
] as const;

function Appearance() {
  const [prefs, setPrefs] = useState<Prefs>(() => ({
    theme: getPref('theme'),
    text: getPref('text'),
    motion: getPref('motion'),
    tips: getPref('tips'),
    streak: getPref('streak'),
  }));

  function change<K extends keyof Prefs>(name: K, value: Prefs[K]) {
    setPref(name, value);
    setPrefs((p) => ({ ...p, [name]: value }));
  }

  return (
    <section class="card settings">
      <h2 class="card__title">Appearance</h2>
      <p class="muted">These apply to this device.</p>
      <div class="setting setting--stacked">
        <span class="setting__label">Theme</span>
        <Segmented label="Theme" value={prefs.theme} options={THEMES} onChange={(v) => change('theme', v)} />
      </div>
      <div class="setting setting--stacked">
        <div class="setting__text">
          <span class="setting__label">Text size</span>
          <span class="setting__hint">For questions, answers and replies.</span>
        </div>
        <Segmented label="Text size" value={prefs.text} options={TEXT_SIZES} onChange={(v) => change('text', v)} />
        <p class="text-sample">What’s something small I did lately that meant a lot to you?</p>
      </div>
      <div class="setting setting--stacked">
        <div class="setting__text">
          <span class="setting__label">Motion</span>
          <span class="setting__hint">Reduced turns off animations, like the reveal. System follows this device’s setting.</span>
        </div>
        <Segmented label="Motion" value={prefs.motion} options={MOTION} onChange={(v) => change('motion', v)} />
      </div>
      <div class="setting">
        <div class="setting__text">
          <span class="setting__label">Writing tips</span>
          <span class="setting__hint">A gentle prompt under the answer and reply boxes.</span>
        </div>
        <Switch label="Writing tips" checked={prefs.tips === 'on'} onChange={(v) => change('tips', v ? 'on' : 'off')} />
      </div>
      <div class="setting">
        <div class="setting__text">
          <span class="setting__label">Days in a row</span>
          <span class="setting__hint">On Today, how many days in a row you’ve both answered.</span>
        </div>
        <Switch label="Days in a row" checked={prefs.streak === 'on'} onChange={(v) => change('streak', v ? 'on' : 'off')} />
      </div>
    </section>
  );
}

function Profile() {
  const me = useMe();
  const [name, setName] = useState(me.user.name);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() && name.trim() !== me.user.name;

  async function save(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      setMe(await api.updateMe({ name }));
      toast('Name updated');
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card settings">
      <h2 class="card__title">Profile</h2>
      <form class="stack" onSubmit={save}>
        <div class="field">
          <label class="field__label" for="profile-name">
            First name
          </label>
          <div class="row">
            <input
              id="profile-name"
              class="input input--grow"
              value={name}
              maxLength={LIMITS.nameMax}
              onInput={(e) => setName(e.currentTarget.value)}
              required
            />
            {dirty && (
              <button class="btn btn--primary btn--sm" disabled={busy}>
                Save
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}

function Journal() {
  const me = useMe();
  return (
    <section class="card settings">
      <h2 class="card__title">Keep a copy</h2>
      <p class="muted">
        Download every question you’ve answered, both your answers and your replies, as a file you can keep anywhere. {me.partner!.name}’s
        answers are included once you’ve both written yours.
      </p>
      <a class="btn btn--ghost btn--block" href={JOURNAL_EXPORT_URL} download>
        <DownloadIcon size={16} /> Download our journal
      </a>
    </section>
  );
}

function InstallApp() {
  if (isStandalone()) return null;
  return (
    <section class="card settings">
      <h2 class="card__title">Add to your Home Screen</h2>
      <p class="muted">Relationshipper opens like an app from your Home Screen, keeps working offline, and can remind you each day.</p>
      <InstallSteps />
    </section>
  );
}

function Relationship({ saving, update }: { saving: boolean; update: (fn: () => Promise<ReturnType<typeof useMe>>, success?: string) => Promise<void> }) {
  const me = useMe();
  const bootyCalls = useBootyCalls();
  const couple = me.couple!;
  const stage: CoupleStage = { married: couple.married, livingTogether: couple.livingTogether, hasKids: couple.hasKids };
  return (
    <section class="card settings">
      <h2 class="card__title">Your relationship</h2>
      <p class="muted">
        Shapes which questions you both get — hypotheticals about marriage, children and living together if they’re still ahead of you.
      </p>
      <div class="setting setting--stacked">
        <StageFields value={stage} onChange={(v) => update(() => api.updateCouple(Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null))))} />
      </div>
      <div class="setting">
        <div class="setting__text">
          <span class="setting__label">Intimacy questions</span>
          <span class="setting__hint">Adds the Intimacy & Desire theme for both of you, including in daily questions.</span>
        </div>
        <Switch
          label="Intimacy questions"
          checked={couple.includeIntimacy}
          disabled={saving}
          onChange={(v) => update(() => api.updateCouple({ includeIntimacy: v }))}
        />
      </div>
      <div class="setting">
        <div class="setting__text">
          <span class="setting__label">Booty calls</span>
          <span class="setting__hint">
            {!me.user.bootyCalls
              ? `A button on Today to ask ${me.partner!.name} for one. It shows once you’ve both turned it on, and lock screens only ever say “a wink”.`
              : bootyCalls.data?.partner
                ? 'On for both of you. Lock screens only ever say “a wink”.'
                : `On for you. It shows once ${me.partner!.name} turns it on too.`}
          </span>
        </div>
        <Switch
          label="Booty calls"
          checked={me.user.bootyCalls}
          disabled={saving}
          onChange={(v) =>
            update(async () => {
              const next = await api.updateMe({ bootyCalls: v });
              invalidate('booty-calls');
              return next;
            })
          }
        />
      </div>
      <div class="setting setting--stacked">
        <div class="setting__text">
          <span class="setting__label">Daily question timezone</span>
          <span class="setting__hint">A new question starts at midnight here, for both of you.</span>
        </div>
        <select
          class="input"
          value={couple.timezone}
          disabled={saving}
          onChange={(e) => update(() => api.updateCouple({ timezone: e.currentTarget.value }), 'Timezone updated')}
        >
          {timeZones(couple.timezone).map((tz) => (
            <option value={tz}>{tz.replaceAll('_', ' ')}</option>
          ))}
        </select>
      </div>
    </section>
  );
}

function Account() {
  const me = useMe();
  const partnerName = me.partner!.name;
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  async function unpair() {
    if (!confirm(`Unpair from ${partnerName}? This permanently deletes every answer, response and question you’ve shared — for both of you.`)) return;
    try {
      setMe(await api.unpair());
      toast('You’re no longer paired.');
    } catch (err) {
      toastError(err);
    }
  }

  async function deleteAccount(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      await disablePushOnDevice().catch(() => {});
      await api.deleteAccount();
      signedOut();
      history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  return (
    <section class="card settings">
      <h2 class="card__title">Account</h2>
      {deleting ? (
        <form class="stack" onSubmit={deleteAccount}>
          <p>
            This deletes your account, unpairs you from {partnerName}, and erases everything you’ve written together. It can’t be undone.
          </p>
          <label class="field">
            <span class="field__label">Type DELETE to confirm</span>
            <input class="input" value={confirmText} onInput={(e) => setConfirmText(e.currentTarget.value)} autoComplete="off" />
          </label>
          <div class="row">
            <button class="btn btn--danger btn--sm" disabled={busy || confirmText !== 'DELETE'}>
              Delete my account
            </button>
            <button type="button" class="btn btn--ghost btn--sm" onClick={() => setDeleting(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div class="stack">
          <p class="muted">Signed in as {accountLabel(me.user)}</p>
          <button class="btn btn--ghost btn--block" onClick={() => signOut().catch(toastError)}>
            Sign out
          </button>
          {!me.couple!.permanent && (
            <button class="btn btn--danger-ghost btn--block" onClick={unpair}>
              Unpair from {partnerName}
            </button>
          )}
          <button class="btn btn--danger-ghost btn--block" onClick={() => setDeleting(true)}>
            Delete account
          </button>
        </div>
      )}
    </section>
  );
}
