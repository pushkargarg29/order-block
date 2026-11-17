/** Tiny in-memory TTL cache with in-flight de-duplication and stale fallback. */
type Entry<T> = { v: T; at: number };
const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>, opts: { staleOnError?: boolean } = { staleOnError: true }): Promise<T> {
  const e = store.get(key) as Entry<T> | undefined;
  if (e && Date.now() - e.at < ttlMs) return e.v;
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fn().then(v => { store.set(key, { v, at: Date.now() }); return v; }).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try { return await p; } catch (err) { if (e && opts.staleOnError !== false) return e.v; throw err; }
}
export function peek<T>(key: string): T | undefined { return (store.get(key) as Entry<T> | undefined)?.v; }
export function sweepCache(maxEntries = 5000) {
  if (store.size <= maxEntries) return;
  const arr = Array.from(store.entries()).sort((a, b) => a[1].at - b[1].at);
  for (let i = 0; i < arr.length - maxEntries; i++) store.delete(arr[i][0]);
}
