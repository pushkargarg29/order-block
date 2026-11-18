import 'server-only';
import type { ScanResult, ScanRow, Timeframe, OiInfo, OptionWalls } from './types';
import { getFnoUniverse } from './instruments';
import { getOptionWalls, getQuotes, type Quote } from './upstox';
import { getRegime, publicRegime } from './context';
import { stage1, stage2, oiFor, type Stage1 } from './pipeline';
import { modelInfo } from './model';
import { sweepCache } from './cache';
import { waitUntil } from '@vercel/functions';
import { isMarketOpen } from './time';
import { BudgetError } from './ratelimit';

async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>, onError: (item: T, error: unknown) => void): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let idx = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try { out[i] = await fn(items[i]); }
      catch (error) { onError(items[i], error); out[i] = null; }
    }
  }));
  return out;
}

const OI_TOP = 60, WALL_TOP = 25;

async function run(tf: Timeframe): Promise<ScanResult> {
  const uni = await getFnoUniverse();
  const [quotesResult, regimeResult] = await Promise.allSettled([getQuotes(uni.map(u => u.key)), getRegime(tf)]);
  const quotes = quotesResult.status === 'fulfilled' ? quotesResult.value : new Map<string, Quote>();
  const regime = regimeResult.status === 'fulfilled' ? regimeResult.value : null;
  if (quotesResult.status === 'rejected') console.error('[stoclio] scan quote request failed', { tf, error: quotesResult.reason });
  if (regimeResult.status === 'rejected') console.error('[stoclio] scan regime request failed', { tf, error: regimeResult.reason });
  const quoteAt = Array.from(quotes.values()).reduce<number | null>((oldest, q) => oldest == null ? q.receivedAt : Math.min(oldest, q.receivedAt), null);
  const quoteCoverage = uni.length ? quotes.size / uni.length : 0;
  const symbolFailures: string[] = [];
  const sampleErrors: unknown[] = [];
  const s1 = (await pool(uni, 8, u => stage1(u, tf, quotes.get(u.key)), (u, error) =>
    {
      symbolFailures.push(u.symbol);
      if (sampleErrors.length < 3) sampleErrors.push(error);
    })).filter((x): x is Stage1 => !!x);
  if (symbolFailures.length) {
    console.error('[stoclio] scan symbol failures', { tf, failed: symbolFailures.length, total: uni.length, symbols: symbolFailures.slice(0, 5), sampleErrors });
  }
  if (!s1.length) {
    const budgetError = sampleErrors.find(error => error instanceof BudgetError);
    if (budgetError) throw budgetError;
    throw new Error(`Scan produced no usable symbols for ${tf}`);
  }

  // OI + option walls only for the strongest candidates (keeps within Upstox rate limits)
  const cands = s1.filter(s => !s.a.choppy && s.a.activeZone).sort((x, y) => y.a.rank - x.a.rank);
  const oiSet = cands.slice(0, OI_TOP), wallSet = cands.slice(0, WALL_TOP);
  const futQ = await getQuotes(oiSet.map(s => s.inst.futKey).filter((k): k is string => !!k)).catch(error => {
    console.error('[stoclio] scan futures quote request failed', { tf, error });
    return new Map<string, Quote>();
  });
  const oiMap = new Map<string, OiInfo | null>(), wallMap = new Map<string, OptionWalls | null>();
  const oiFailures: string[] = [], wallFailures: string[] = [];
  await Promise.all([
    pool(oiSet, 6, async s => { oiMap.set(s.inst.symbol, await oiFor(s.inst, s.inst.futKey ? futQ.get(s.inst.futKey) : undefined)); },
      s => { oiFailures.push(s.inst.symbol); }),
    pool(wallSet, 4, async s => { wallMap.set(s.inst.symbol, await getOptionWalls(s.inst.key)); },
      s => { wallFailures.push(s.inst.symbol); })
  ]);
  if (oiFailures.length) console.error('[stoclio] scan open-interest enrichment failures', { tf, count: oiFailures.length, symbols: oiFailures.slice(0, 5) });
  if (wallFailures.length) console.error('[stoclio] scan option-chain enrichment failures', { tf, count: wallFailures.length, symbols: wallFailures.slice(0, 5) });

  const rows: ScanRow[] = [];
  for (const s of s1) {
    const { a, ctx } = await stage2(s, tf, regime, { oi: oiMap.get(s.inst.symbol), walls: wallMap.get(s.inst.symbol) });
    const q = s.q, z = a.activeZone, ltp = q?.ltp ?? a.last;
    const signedBase = a.bias === 'bearish' ? -a.score : a.bias === 'bullish' ? a.score : (a.biasScore >= 0 ? 1 : -1) * Math.min(a.score, 30);
    rows.push({
      symbol: s.inst.symbol, name: s.inst.name, ltp, changePct: q ? q.changePct : null,
      bias: a.bias, score: a.score, pModel: a.pModel, rank: a.rank, signed: signedBase, choppy: a.choppy,
      er: a.er, rsi: a.rsi, rvol: a.rvol, atrPct: (a.atr / a.last) * 100,
      zone: z ? { top: z.top, bottom: z.bottom, strength: z.strength, distATR: z.side === 'bull' ? Math.max(0, ltp - z.top) / a.atr : Math.max(0, z.bottom - ltp) / a.atr } : null,
      support: a.support, resistance: a.resistance, liquidity: a.liquidityLevel, plan: a.plan,
      lastEvent: a.events[a.events.length - 1] ?? null, sweep: a.sweeps[a.sweeps.length - 1] ?? null, ctx
    });
  }
  rows.sort((x, y) => y.rank - x.rank);
  sweepCache();
  const mi = modelInfo(tf);
  return { tf, at: Date.now(), quoteAt, quoteCoverage, scanCoverage: rows.length / uni.length, total: uni.length, scanned: rows.length, failed: uni.length - rows.length, rows,
    enrichment: {
      oi: { requested: oiSet.length, available: Array.from(oiMap.values()).filter(Boolean).length },
      options: { requested: wallSet.length, available: Array.from(wallMap.values()).filter(Boolean).length }
    },
    regime: regime ? publicRegime(regime) : null, model: { fitted: mi.fitted, trainedAt: mi.trainedAt, samples: mi.samples } };
}

const lastScan = new Map<Timeframe, ScanResult>();
const running = new Map<Timeframe, Promise<ScanResult>>();
const failedUntil = new Map<Timeframe, { at: number; error: unknown }>();

function refresh(tf: Timeframe): Promise<ScanResult> {
  let p = running.get(tf);
  if (!p) {
    const failure = failedUntil.get(tf);
    if (failure && Date.now() < failure.at) return Promise.reject(failure.error);
    p = run(tf).then(r => {
      lastScan.set(tf, r);
      failedUntil.delete(tf);
      return r;
    }).catch(error => {
      const retryAfter = error instanceof BudgetError ? error.retryAfterMs : 30000;
      failedUntil.set(tf, { at: Date.now() + Math.max(5000, retryAfter), error });
      throw error;
    }).finally(() => running.delete(tf));
    running.set(tf, p);
  }
  return p;
}

/** Returns the latest scan instantly; if it is older than the TTL, a refresh runs in the background. */
export async function scan(tf: Timeframe): Promise<ScanResult> {
  const ttl = isMarketOpen() ? (tf === '1d' ? 180000 : 45000) : 900000;
  const last = lastScan.get(tf);
  if (last) {
    if (Date.now() - last.at > ttl) { const p = refresh(tf).catch(() => last); waitUntil(p); }
    return last;
  }
  return refresh(tf);
}

/** Pre-compute every timeframe in the background (used by the warm-up job). */
export function warmAll(): Promise<unknown> {
  return refresh('15m').then(() => Promise.allSettled([refresh('5m'), refresh('1h'), refresh('1d')]));
}
