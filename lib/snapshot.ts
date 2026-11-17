import 'server-only';
import { unstable_cache } from 'next/cache';
import { waitUntil } from '@vercel/functions';
import type { Analysis, Candle, ScanResult, ScanRow, Timeframe } from './types';
import { scan } from './scanner';
import { findSymbol } from './instruments';
import { analyzeSymbol } from './pipeline';
import { publicRegime } from './context';
import { modelInfo } from './model';

/**
 * Shared snapshots in the Next.js Data Cache: every server instance (including brand-new cold ones)
 * gets the latest result instantly; when it is older than `revalidate`, Next.js serves the stale copy
 * and recomputes in the background (stale-while-revalidate).
 */
const sleep = (ms: number) => new Promise<undefined>(r => setTimeout(() => r(undefined), ms));

async function viaCache<T>(key: string[], revalidate: number, fn: () => Promise<T>): Promise<T> {
  try { return await unstable_cache(fn, ['stoclio-snap-v8', ...key], { revalidate })(); }
  catch { return fn(); } // data cache unavailable (local scripts)
}

/** Resolve within `waitMs` or return null; unfinished work keeps running and lands in the cache. */
async function within<T>(p: Promise<T>, waitMs: number): Promise<T | null> {
  const safe = p.catch(() => null);
  const r = await Promise.race([safe, sleep(waitMs)]);
  if (r === undefined) { waitUntil(safe); return null; }
  return r;
}

// ---------- full scan ----------
export const getScan = (tf: Timeframe) => viaCache<ScanResult>(['scan', tf], tf === '1d' ? 120 : 30, () => scan(tf));
export const initialScan = (tf: Timeframe, waitMs = 450) => within(getScan(tf), waitMs);

// ---------- homepage hero (#1 setup + chart) ----------
export type Top = { row: ScanRow | null; candles: Candle[]; analysis: Analysis | null; at: number };
export const getTop = () => viaCache<Top>(['top'], 30, async () => {
  const s = await getScan('15m');
  const row = s.rows.filter(x => x.bias !== 'neutral' && !x.choppy && x.zone && !x.ctx.flags.ban).sort((a, b) => b.rank - a.rank)[0] ?? null;
  if (!row) return { row: null, candles: [], analysis: null, at: s.at };
  const inst = await findSymbol(row.symbol);
  const r = inst ? await analyzeSymbol(inst, '15m') : null;
  const a = r?.analysis ? { ...r.analysis, planLevels: [], ema20Series: [], ema50Series: [] } : null;
  return { row, candles: (r?.candles ?? []).slice(-120), analysis: a, at: s.at };
});
export const initialTop = (waitMs = 450) => within(getTop(), waitMs);

// ---------- per-symbol chart ----------
export type ChartPayload = Awaited<ReturnType<typeof buildChart>>;
async function buildChart(symbol: string, tf: Timeframe) {
  const inst = await findSymbol(symbol);
  if (!inst) return null;
  const r = await analyzeSymbol(inst, tf);
  return {
    symbol: inst.symbol, name: inst.name, lot: inst.lot, tf, candles: r.candles.slice(-600),
    analysis: r.analysis ? { ...r.analysis, planLevels: [] } : null, ctx: r.ctx,
    quote: r.quote, regime: r.regime ? publicRegime(r.regime) : null, model: modelInfo(tf), at: Date.now()
  };
}
export const getChart = (symbol: string, tf: Timeframe) => viaCache(['chart', symbol, tf], tf === '1d' ? 60 : 15, () => buildChart(symbol, tf));
export const initialChart = (symbol: string, tf: Timeframe, waitMs = 600) => within(getChart(symbol, tf), waitMs);
