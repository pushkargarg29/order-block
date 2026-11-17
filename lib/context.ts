/**
 * Institutional context modules layered on top of the fitted model probability.
 * Each module contributes a log-odds adjustment (documented on /methodology). Final score = σ(logit(p) + Σ adjustments).
 */
import type { Adjustment, Candle, Context, HtfSummary, OiBuildup, OiInfo, OptionWalls, RegimeInfo, Side, StockRegime, Timeframe, Zone, Bias, Analysis } from './types';
import { alignCloses, corrBeta, logit, resample, returns, sigmoid, weekBucket } from './indicators';
import { analyze, buildPlan, htfTrend, type PlanLevel } from './smc';
import { HTF_MAP, HTF_WEIGHTS } from './backtest';
import { getCandles, getDaily, getQuotes, patchLast } from './upstox';
import { INDEX } from './instruments';
import { getBanList, getEarnings } from './nse';
import { memo } from './cache';
import { isMarketOpen, istDate } from './time';

export const ADJ = {
  oiConfirm: 0.30, oiContradict: -0.40, htfConfluence: 0.15, regimeAgainst: -0.35, regimeWith: 0.10, vixHigh: -0.15,
  wallConfluence: 0.20, wallBlocks: -0.25, earnings: -0.20
};

// ---------------- 1. OI build-up ----------------
export function classifyOi(priceChgPct: number, oi: number, prevOi: number, futKey: string): OiInfo {
  const oiChgPct = prevOi ? ((oi - prevOi) / prevOi) * 100 : 0;
  const up = priceChgPct > 0.1, dn = priceChgPct < -0.1, oiUp = oiChgPct > 1, oiDn = oiChgPct < -1;
  let buildup: OiBuildup = 'Neutral', signal = 0;
  if (up && oiUp) { buildup = 'Long build-up'; signal = 1; }
  else if (dn && oiUp) { buildup = 'Short build-up'; signal = -1; }
  else if (up && oiDn) { buildup = 'Short covering'; signal = 0.5; }
  else if (dn && oiDn) { buildup = 'Long unwinding'; signal = -0.5; }
  return { futKey, oi, prevOi, oiChgPct, priceChgPct, buildup, signal: signal as OiInfo['signal'] };
}

// ---------------- 2. Higher-timeframe agreement ----------------
const IST = 19800000, OPEN = 33300000;
const intraBucket = (ms: number) => (t: number) => Math.floor((t + IST - OPEN) / ms);

/** Higher-timeframe candles for a base tf (reuses the cached base/daily data — no extra intraday requests). */
export async function htfCandles(key: string, tf: Timeframe, base: Candle[], ltp?: number, dayOhlc?: { o: number; h: number; l: number; v: number }): Promise<{ tf: string; c: Candle[] }[]> {
  const daily = tf === '5m' ? null : patchLast(await getDaily(key), ltp, '1d', dayOhlc);
  return HTF_MAP[tf].map(f => {
    let c: Candle[];
    if (f.tf === '15m') c = resample(base, intraBucket(900000));
    else if (f.tf === '1h') c = resample(base, intraBucket(3600000));
    else if (f.tf === '1d') c = daily ?? [];
    else c = resample(daily ?? [], weekBucket);
    return { tf: f.tf, c };
  });
}

export function htfSummary(frames: { tf: string; c: Candle[] }[], side: Side, zone: Zone | null): HtfSummary {
  const wts = HTF_WEIGHTS(frames.length), sg = side === 'bull' ? 1 : -1;
  const done = isMarketOpen();
  let align = 0, confluence = false;
  const info = frames.map((f, i) => {
    const series = done && f.c.length > 1 ? f.c.slice(0, -1) : f.c; // completed bars only while the session is live
    const trend = htfTrend(series);
    align += wts[i] * trend * sg;
    if (i === 0 && zone && series.length >= 60) {
      const a = analyze(series, { intraday: f.tf !== '1d' && f.tf !== '1w' });
      confluence = !!a?.zones.some(z => !z.invalidated && z.side === side && z.bottom <= zone.top && z.top >= zone.bottom);
    }
    const label: Bias = trend > 0.2 ? 'bullish' : trend < -0.2 ? 'bearish' : 'neutral';
    return { tf: f.tf as Timeframe, trend, label };
  });
  return { frames: info, align, confluence };
}

// ---------------- 3. Index / VIX regime + ban + earnings ----------------
type IndexState = { tfTrend: number; dayTrend: number; ltp: number | null; chgPct: number | null; candles: Candle[] };
export async function getRegime(tf: Timeframe): Promise<RegimeInfo & { _idx: { NIFTY: IndexState; BANKNIFTY: IndexState } }> {
  return memo(`regime:${tf}`, isMarketOpen() ? 120000 : 900000, async () => {
    const q = await getQuotes([INDEX.NIFTY, INDEX.BANKNIFTY, INDEX.VIX]).catch(() => new Map());
    const idx = async (key: string): Promise<IndexState> => {
      const qq = q.get(key);
      const base = patchLast(await getCandles(key, tf).catch(() => [] as Candle[]), qq?.ltp, tf, qq ? { o: qq.open, h: qq.high, l: qq.low, v: 0 } : undefined);
      const daily = tf === '1d' ? base : patchLast(await getDaily(key).catch(() => [] as Candle[]), qq?.ltp, '1d', qq ? { o: qq.open, h: qq.high, l: qq.low, v: 0 } : undefined);
      return { tfTrend: htfTrend(base), dayTrend: htfTrend(daily), ltp: qq?.ltp ?? null, chgPct: qq?.changePct ?? null, candles: base };
    };
    const [nifty, bank, ban, earnings] = await Promise.all([idx(INDEX.NIFTY), idx(INDEX.BANKNIFTY), getBanList(), getEarnings()]);
    const v = q.get(INDEX.VIX);
    const lvl = v ? (v.ltp < 13 ? 'low' : v.ltp < 18 ? 'normal' : v.ltp < 24 ? 'elevated' : 'high') : 'unknown';
    const strip = ({ candles, ...r }: IndexState) => r;
    return {
      nifty: strip(nifty), bank: strip(bank), vix: { ltp: v?.ltp ?? null, chgPct: v?.changePct ?? null, level: lvl },
      ban, earnings, at: Date.now(), _idx: { NIFTY: nifty, BANKNIFTY: bank }
    } as RegimeInfo & { _idx: { NIFTY: IndexState; BANKNIFTY: IndexState } };
  });
}
export const publicRegime = (r: RegimeInfo & { _idx?: unknown }): RegimeInfo => { const { _idx, ...rest } = r as RegimeInfo & { _idx?: unknown }; return rest; };

export function stockRegime(stock: Candle[], r: Awaited<ReturnType<typeof getRegime>>, side: Side): StockRegime | null {
  const pick = (k: 'NIFTY' | 'BANKNIFTY') => {
    const [a, b] = alignCloses(stock.slice(-150), r._idx[k].candles);
    return { k, ...corrBeta(returns(a), returns(b)) };
  };
  const n = pick('NIFTY'), b = pick('BANKNIFTY');
  if (!n.corr && !b.corr) return null;
  const best = b.corr > n.corr + 0.05 ? b : n;
  const st = best.k === 'NIFTY' ? r.nifty : r.bank;
  const refTrend = 0.5 * st.tfTrend + 0.5 * st.dayTrend, sg = side === 'bull' ? 1 : -1;
  return {
    ref: best.k, corr: best.corr, beta: best.beta, refTrend,
    against: best.corr > 0.4 && refTrend * sg < -0.3,
    vixPenalty: r.vix.level === 'high' || (r.vix.level === 'elevated' && (r.vix.chgPct ?? 0) > 8)
  };
}

// ---------------- 4/5. Apply all modules ----------------
export function applyContext(a: Analysis, input: { oi: OiInfo | null; htf: HtfSummary | null; regime: StockRegime | null; walls: OptionWalls | null; symbol: string; regimeInfo: RegimeInfo | null }): Context {
  const adjustments: Adjustment[] = [];
  const side: Side = a.biasScore >= 0 ? 'bull' : 'bear', sg = side === 'bull' ? 1 : -1;
  const { oi, htf, regime, walls } = input;
  if (oi && oi.signal !== 0) {
    const s = oi.signal * sg;
    adjustments.push({ key: 'oi', label: `OI: ${oi.buildup}`, delta: s > 0 ? ADJ.oiConfirm * Math.abs(oi.signal) : ADJ.oiContradict * Math.abs(oi.signal) });
  }
  if (htf?.confluence) adjustments.push({ key: 'htfConf', label: `Order block confluence on ${htf.frames[0]?.tf}`, delta: ADJ.htfConfluence });
  if (regime) {
    if (regime.against) adjustments.push({ key: 'regime', label: `Against ${regime.ref} trend`, delta: ADJ.regimeAgainst });
    else if (regime.corr > 0.4 && regime.refTrend * sg > 0.3) adjustments.push({ key: 'regime', label: `With ${regime.ref} trend`, delta: ADJ.regimeWith });
    if (regime.vixPenalty) adjustments.push({ key: 'vix', label: 'India VIX elevated', delta: ADJ.vixHigh });
  }
  if (walls && a.activeZone && a.plan) {
    const z = a.activeZone, risk = Math.abs(a.plan.entry - a.plan.sl), tol = 0.5 * a.atr;
    const defend = side === 'bull' ? walls.putWall : walls.callWall, block = side === 'bull' ? walls.callWall : walls.putWall;
    if (defend != null && defend >= z.bottom - tol && defend <= z.top + tol) adjustments.push({ key: 'wallConf', label: `${side === 'bull' ? 'Put' : 'Call'} OI wall ${defend} at order block`, delta: ADJ.wallConfluence });
    if (block != null && (side === 'bull' ? block > a.plan.entry && block < a.plan.entry + risk : block < a.plan.entry && block > a.plan.entry - risk))
      adjustments.push({ key: 'wallBlock', label: `${side === 'bull' ? 'Call' : 'Put'} OI wall ${block} before 1R`, delta: ADJ.wallBlocks });
  }
  const earn = input.regimeInfo?.earnings?.[input.symbol] ?? null;
  if (earn) {
    const days = (Date.parse(earn) - Date.parse(istDate())) / 86400000;
    if (days >= 0 && days <= 3) adjustments.push({ key: 'earn', label: `Results on ${earn}`, delta: ADJ.earnings });
  }
  const ban = !!input.regimeInfo?.ban?.includes(input.symbol);
  return { oi, htf, regime, walls, flags: { ban, earnings: earn }, adjustments };
}

/** Recompute score / rank / plan after context. */
export function finalize(a: Analysis, ctx: Context): Analysis {
  const out = { ...a };
  if (a.pModel != null) {
    const z = logit(a.pModel) + ctx.adjustments.reduce((s, x) => s + x.delta, 0);
    out.score = Math.round(100 * sigmoid(z));
  }
  out.rank = Math.round(out.score * (0.55 + 0.45 * a.proximity));
  if (ctx.walls && a.plan && a.support != null && a.resistance != null) {
    // re-plan with option OI walls as additional target levels (same structure / liquidity levels as before)
    const w = ctx.walls;
    const levels: PlanLevel[] = [
      ...a.liquidity.map(l => ({ price: l.price, source: 'Liquidity' as const })),
      ...a.planLevels,
      ...[w.callWall, w.putWall].filter((x): x is number => x != null).map(p => ({ price: p, source: 'OI wall' as const }))
    ];
    out.plan = buildPlan(a.plan.side, a.last, a.atr, a.activeZone, a.support, a.resistance, levels, a.choppy, a.vwap != null);
  }
  return out;
}
