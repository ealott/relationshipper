import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

// A tiny stale-while-revalidate cache: screens render cached data instantly
// and refresh in the background (on mount, focus, interval and push).

const cache = new Map<string, unknown>();
const listeners = new Set<(key?: string) => void>();

/** Ask every mounted query (or those whose key starts with `prefix`) to refetch. */
export function invalidate(prefix?: string) {
  for (const l of [...listeners]) l(prefix);
}

export function setQueryData<T>(key: string, data: T) {
  cache.set(key, data);
}

export function clearQueryCache() {
  cache.clear();
}

export interface Query<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
  mutate: (data: T) => void;
}

export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, opts: { refreshInterval?: number } = {}): Query<T> {
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined));
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const keyRef = useRef(key);
  keyRef.current = key;

  const refresh = useCallback(async () => {
    const k = keyRef.current;
    if (!k) return;
    setLoading(true);
    try {
      const next = await fetcherRef.current();
      if (keyRef.current !== k) return;
      cache.set(k, next);
      setData(next);
      setError(undefined);
    } catch (err) {
      if (keyRef.current === k) setError(err as Error);
    } finally {
      if (keyRef.current === k) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(key ? (cache.get(key) as T | undefined) : undefined);
    setError(undefined);
    if (!key) return;
    void refresh();
    const onInvalidate = (prefix?: string) => {
      if (!prefix || key.startsWith(prefix)) void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    listeners.add(onInvalidate);
    document.addEventListener('visibilitychange', onVisible);
    const timer = opts.refreshInterval
      ? setInterval(() => document.visibilityState === 'visible' && void refresh(), opts.refreshInterval)
      : undefined;
    return () => {
      listeners.delete(onInvalidate);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearInterval(timer);
    };
  }, [key, opts.refreshInterval, refresh]);

  const mutate = useCallback((next: T) => {
    if (keyRef.current) cache.set(keyRef.current, next);
    setData(next);
  }, []);

  return { data, error, loading: loading && data === undefined, refresh, mutate };
}
