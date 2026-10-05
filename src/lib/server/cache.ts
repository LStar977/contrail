import 'server-only';

// A tiny in-memory cache with request coalescing and serve-stale-on-error.
// Free upstreams rate-limit hard, so every viewer should share one upstream call per key.
type Entry = { at: number; value: unknown };
type Store = { entries: Map<string, Entry>; inflight: Map<string, Promise<unknown>> };

const g = globalThis as unknown as { __contrailCache?: Store };
const store: Store = (g.__contrailCache ??= { entries: new Map(), inflight: new Map() });
const MAX_ENTRIES = 1200;

export class UpstreamError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function cached<T>(key: string, freshMs: number, staleMs: number, load: () => Promise<T>): Promise<{ value: T; stale: boolean }> {
  const now = Date.now();
  const hit = store.entries.get(key);
  if (hit && now - hit.at < freshMs) return { value: hit.value as T, stale: false };

  let pending = store.inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = load()
      .then((value) => {
        store.entries.delete(key);
        store.entries.set(key, { at: Date.now(), value });
        while (store.entries.size > MAX_ENTRIES) store.entries.delete(store.entries.keys().next().value as string);
        return value;
      })
      .finally(() => store.inflight.delete(key));
    store.inflight.set(key, pending);
  }
  try {
    return { value: await pending, stale: false };
  } catch (err) {
    if (hit && now - hit.at < staleMs) return { value: hit.value as T, stale: true };
    throw err;
  }
}

/** Run async jobs with a concurrency cap. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
