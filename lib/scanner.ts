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

async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let idx = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (idx < items.length) { const i = idx++; try { out[i] = await fn(items[i]); } catch { out[i] = null; } }
  }));
  return out;
}

const OI_TOP = 60, WALL_TOP = 25;

async function run(tf: Timeframe): Promise<ScanResult> {
  const uni = await getFnoUniverse();
  const [quotes, regime] = await Promise.all([
    getQuotes(uni.map(u => u.key)).catch(() => new Map<string, Quote>()),
    getRegime(tf).catch(() => null)
  ]);
  const s1 = (await pool(uni, 8, u => stage1(u, tf, quotes.get(u.key)))).filter((x): x is Stage1 => !!x);

  // OI + option walls only for the strongest candidates (keeps within Upstox rate limits)
  const cands = s1.filter(s => !s.a.choppy && s.a.activeZone).sort((x, y) => y.a.rank - x.a.rank);
  const oiSet = cands.slice(0, OI_TOP), wallSet = cands.slice(0, WALL_TOP);
  const futQ = await getQuotes(oiSet.map(s => s.inst.futKey).filter((k): k is string => !!k)).catch(() => new Map<string, Quote>());
  const oiMap = new Map<string, OiInfo | null>(), wallMap = new Map<string, OptionWalls | null>();
  await Promise.all([
    pool(oiSet, 6, async s => { oiMap.set(s.inst.symbol, await oiFor(s.inst, s.inst.futKey ? futQ.get(s.inst.futKey) : undefined).catch(() => null)); }),
    pool(wallSet, 4, async s => { wallMap.set(s.inst.symbol, await getOptionWalls(s.inst.key).catch(() => null)); })
  ]);

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
  return { tf, at: Date.now(), total: uni.length, scanned: rows.length, failed: uni.length - rows.length, rows,
    regime: regime ? publicRegime(regime) : null, model: { calibrated: mi.calibrated, trainedAt: mi.trainedAt, samples: mi.samples } };
}

const lastScan = new Map<Timeframe, ScanResult>();
const running = new Map<Timeframe, Promise<ScanResult>>();

function refresh(tf: Timeframe): Promise<ScanResult> {
  let p = running.get(tf);
  if (!p) {
    p = run(tf).then(r => { lastScan.set(tf, r); return r; }).finally(() => running.delete(tf));
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
