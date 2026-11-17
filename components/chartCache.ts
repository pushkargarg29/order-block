'use client';
/** Client cache for chart payloads: hover/tap prefetch + instant back/forward navigation. */
type Entry = { at: number; p: Promise<unknown> };
const cache = new Map<string, Entry>();
const key = (s: string, tf: string) => `${s}|${tf}`;

export function prefetchChart(symbol: string, tf: string) {
  const k = key(symbol, tf), e = cache.get(k);
  if (e && Date.now() - e.at < 20000) return e.p;
  const p = fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`)
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Failed'); return j; });
  p.catch(() => cache.delete(k));
  cache.set(k, { at: Date.now(), p });
  if (cache.size > 60) cache.delete(cache.keys().next().value as string);
  return p;
}
/** Returns a recent prefetched (or in-flight) payload, if any. */
export function cachedChart<T>(symbol: string, tf: string, maxAgeMs = 20000): Promise<T> | null {
  const e = cache.get(key(symbol, tf));
  return e && Date.now() - e.at < maxAgeMs ? (e.p as Promise<T>) : null;
}
export function rememberChart(symbol: string, tf: string, data: unknown, at = Date.now()) {
  cache.set(key(symbol, tf), { at, p: Promise.resolve(data) });
}
