/**
 * A small in-memory cache for data many visitors share (leaderboards, the
 * games list, a game's public details). The site runs as one process, so a
 * Map is enough, and it keeps real objects (Dates included) with nothing to
 * serialise, which matters on a small server.
 *
 * Stale-while-revalidate: after `ttlMs` the next visitor still gets the
 * cached value at once while a fresh one loads in the background. Only a
 * value older than `maxStaleMs` (or none at all) makes a visitor wait.
 * Concurrent requests for the same key share one load. `bust(tag)` drops
 * entries when something they show has changed.
 */
type Entry = { value: unknown; at: number; tags: string[]; loading?: Promise<unknown> };

const g = globalThis as unknown as { __tpCache?: Map<string, Entry> };
const store = (g.__tpCache ??= new Map<string, Entry>());
const MAX_ENTRIES = 600;

export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  { ttlMs = 60_000, maxStaleMs = 30 * 60_000, tags = [] as string[] } = {},
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && !hit.loading && now - hit.at < ttlMs) return hit.value as T;

  const refresh = () => {
    const entry: Entry = hit ?? { value: undefined, at: 0, tags };
    if (entry.loading) return entry.loading as Promise<T>;
    entry.loading = load()
      .then((value) => {
        entry.value = value;
        entry.at = Date.now();
        entry.tags = tags;
        return value;
      })
      .finally(() => {
        entry.loading = undefined;
      });
    store.set(key, entry);
    trim();
    return entry.loading as Promise<T>;
  };

  if (hit && hit.at > 0 && now - hit.at < maxStaleMs) {
    // Serve what we have; a failed background refresh keeps the old value.
    refresh().catch((err) => console.error(`[cache] refresh failed for ${key}`, err));
    return hit.value as T;
  }
  return refresh();
}

/** Forgets every cached value with this tag (or whose key starts with it). */
export function bust(...tags: string[]) {
  for (const [key, e] of store) if (tags.some((t) => e.tags.includes(t) || key.startsWith(t))) store.delete(key);
}

function trim() {
  if (store.size <= MAX_ENTRIES) return;
  // Oldest first: Maps keep insertion order.
  for (const key of store.keys()) {
    store.delete(key);
    if (store.size <= MAX_ENTRIES * 0.9) break;
  }
}
