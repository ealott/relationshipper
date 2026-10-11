import { useState } from 'preact/hooks';
import { getFlag, installPrompt, isAndroid, isIOS, isStandalone, promptInstall, setFlag } from '../lib/platform';
import { useStore } from '../lib/store';
import { DownloadIcon, ShareIcon } from './Icons';
import { Raccoon } from './Raccoon';

/** How to add the app to this device's Home Screen: the browser's own prompt, or the steps. */
export function InstallSteps() {
  const prompt = useStore(installPrompt);
  if (prompt) {
    return (
      <button class="btn btn--primary btn--sm" onClick={promptInstall}>
        <DownloadIcon size={16} /> Install Relationshipper
      </button>
    );
  }
  if (isIOS()) {
    return (
      <ol class="steps">
        <li>
          Tap <ShareIcon size={15} /> <strong>Share</strong>. In Safari’s newer layout it’s under <strong>•••</strong>.
        </li>
        <li>
          Choose <strong>Add to Home Screen</strong>. If you don’t see it, scroll down or tap <strong>View More</strong>.
        </li>
        <li>
          Tap <strong>Add</strong>, then open Relationshipper from your Home Screen.
        </li>
      </ol>
    );
  }
  if (isAndroid()) {
    return (
      <ol class="steps">
        <li>
          Open your browser’s menu (<strong>⋮</strong>).
        </li>
        <li>
          Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </li>
      </ol>
    );
  }
  return (
    <p class="muted">
      On your phone, open this page in Safari (iPhone) or Chrome (Android) and add it to your Home Screen. On a computer, use the
      install icon in Chrome or Edge’s address bar.
    </p>
  );
}

/** A card on Today until the app is installed (or the card is dismissed). */
export function InstallCard() {
  const [dismissed, setDismissed] = useState(() => getFlag('install-card-dismissed') === '1');
  if (dismissed || isStandalone()) return null;
  return (
    <aside class="card prompt">
      <Raccoon size={44} class="prompt__raccoon" />
      <div class="prompt__body">
        <h2 class="card__title">Add Relationshipper to your Home Screen</h2>
        <p>
          It opens like an app and keeps working offline.
          {isIOS() ? ' On iPhone, it’s also the only way to get daily reminders.' : ' It can also remind you each day.'}
        </p>
        <InstallSteps />
        <button
          class="link-button"
          onClick={() => {
            setFlag('install-card-dismissed', '1');
            setDismissed(true);
          }}
        >
          Not now. It’s in Settings if you want it later.
        </button>
      </div>
    </aside>
  );
}
