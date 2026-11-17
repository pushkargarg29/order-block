'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ScanResult, Timeframe } from '@/lib/types';
import { isMarketOpen } from '@/lib/time';

/**
 * Shared scan store: every component asking for the same timeframe shares ONE request
 * and ONE 5-second refresh timer (homepage hero, leaders, 3D universe, pulse strip…).
 */
type Entry = { data: ScanResult | null; error: string | null; loading: boolean; inflight: Promise<void> | null; subs: Set<() => void>; timer: ReturnType<typeof setInterval> | null };
const store = new Map<Timeframe, Entry>();

function entry(tf: Timeframe): Entry {
  let e = store.get(tf);
  if (!e) { e = { data: null, error: null, loading: true, inflight: null, subs: new Set(), timer: null }; store.set(tf, e); }
  return e;
}
const notify = (e: Entry) => e.subs.forEach(f => f());

function load(tf: Timeframe): Promise<void> {
  const e = entry(tf);
  if (e.inflight) return e.inflight;
  e.inflight = (async () => {
    try {
      const r = await fetch(`/api/scan?tf=${tf}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Live data is temporarily unavailable.');
      e.data = j; e.error = null;
      try { localStorage.setItem(`stoclio:scan:${tf}`, JSON.stringify(j)); } catch { /* storage full or disabled */ }
    } catch (err) { e.error = err instanceof Error ? err.message : 'Live data is temporarily unavailable.'; }
    finally { e.loading = false; e.inflight = null; notify(e); }
  })();
  return e.inflight;
}

/** Seed the shared store with server-rendered data (called during render; safe & idempotent). */
export function seedScan(tf: Timeframe, data: ScanResult | null | undefined) {
  if (!data) return;
  const e = entry(tf);
  if (!e.data || e.data.at < data.at) { e.data = data; e.loading = false; e.error = null; }
}

/** Start loading a timeframe in the background (e.g. on idle) so later pages open instantly. */
export const prefetchScan = (tf: Timeframe) => { const e = entry(tf); if (!e.data || Date.now() - e.data.at > 5000) load(tf); };

function restore(tf: Timeframe) {
  const e = entry(tf);
  if (e.data) return;
  try {
    const raw = localStorage.getItem(`stoclio:scan:${tf}`);
    if (!raw) return;
    const d = JSON.parse(raw) as ScanResult;
    if (d && Array.isArray(d.rows) && Date.now() - d.at < 3 * 86400000) { e.data = d; e.loading = false; notify(e); }
  } catch { /* ignore */ }
}

/** Server-rendered scan provided to every consumer on the page (identical on server and first client render). */
export const ScanSeedContext = createContext<ScanResult | null>(null);

export function useScan(tf: Timeframe, initial?: ScanResult | null) {
  const ctx = useContext(ScanSeedContext);
  const init = initial && initial.tf === tf ? initial : ctx && ctx.tf === tf ? ctx : null;
  if (typeof window === 'undefined') {
    // server render: never read the shared module store (it may hold another request's data)
    return { data: init, error: null as string | null, loading: !init, reload: () => Promise.resolve() };
  }
  seedScan(tf, init);
  const [, force] = useState(0);
  useEffect(() => {
    const e = entry(tf);
    const sub = () => force(x => x + 1);
    e.subs.add(sub);
    restore(tf); // last-seen data from this browser shows instantly while fresh data loads
    if (!e.data || Date.now() - e.data.at > 5000) load(tf);
    if (!e.timer) e.timer = setInterval(() => { if (isMarketOpen() && document.visibilityState === 'visible') load(tf); }, 5000);
    force(x => x + 1);
    return () => { e.subs.delete(sub); if (!e.subs.size && e.timer) { clearInterval(e.timer); e.timer = null; } };
  }, [tf]);
  const e = entry(tf);
  return { data: e.data, error: e.error, loading: e.loading && !e.data, reload: () => load(tf) };
}

/** Polls LTP for a set of symbols every 5s during market hours */
export function useLiveQuotes(symbols: string[]) {
  const [q, setQ] = useState<Record<string, { ltp: number; changePct: number }>>({});
  const key = symbols.slice(0, 100).join(',');
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/api/quotes?symbols=${encodeURIComponent(key)}`);
        if (r.ok) { const j = await r.json(); if (!stop) setQ(j.quotes || {}); }
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(() => { if (isMarketOpen()) tick(); }, 5000);
    return () => { stop = true; clearInterval(id); };
  }, [key]);
  return q;
}
