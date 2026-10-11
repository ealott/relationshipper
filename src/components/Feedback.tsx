import { online } from '../lib/platform';
import { useStore } from '../lib/store';
import { applyUpdate, updateReady } from '../lib/sw';
import { toasts } from '../lib/toast';

export function Toaster() {
  const list = useStore(toasts);
  return (
    <div class="toaster" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} class={`toast toast--${t.tone}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function SystemBanners() {
  const isOnline = useStore(online);
  const update = useStore(updateReady);
  return (
    <>
      {!isOnline && <div class="sysbanner">You’re offline. You can browse questions, but answering needs a connection.</div>}
      {update && (
        <div class="sysbanner sysbanner--update">
          A new version is ready.
          <button class="sysbanner__action" onClick={applyUpdate}>
            Refresh
          </button>
        </div>
      )}
    </>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div class="spinner" role="progressbar" aria-label={label}>
      <span />
      <span />
      <span />
    </div>
  );
}

export function ErrorNotice({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div class="notice notice--error">
      <p>{error.message}</p>
      {onRetry && (
        <button class="btn btn--ghost btn--sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
