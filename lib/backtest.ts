/**
 * Walk-forward, no-look-ahead order-block backtester.
 * For every order block: wait until it becomes available (2 bars after the break), then take the FIRST retest.
 * Features are measured on the bar BEFORE the touch; entry is a limit at the zone edge (or the open if price gaps through).
 * Entry expiry follows live-plan validity; invalidated zones are not entered. Stop = far edge ∓ 0.2 ATR.
 * Intraday exits square off at 15:15; daily trades exit at invalidation, stop, all targets, or after 10 sessions if TP1 was not reached.
 * Trade P&L uses the 50% / 30% / 20% R-multiple ladder (targets are not snapped to live structure or OI levels).
 * Conservative: if stop and target fall inside the same bar, the stop is assumed hit first.
 */
import type { BtStats, BtTrade, Candle, Timeframe } from './types';
import { buildSeries, detect, htfTrendAt, zoneFeatures } from './smc';
import { predict } from './model';
import { resample, weekBucket, mean } from './indicators';
import { brier, reliability } from './fit';

const IST = 19800000, OPEN = 33300000; // 09:15 IST
const intradayBucket = (ms: number) => (t: number) => Math.floor((t + IST - OPEN) / ms);
const dayBucket = (t: number) => Math.floor((t + IST) / 86400000);
const durationMs: Record<Timeframe, number> = { '5m': 300000, '15m': 900000, '1h': 3600000, '1d': 86400000 };
const barCloseMinute = (t: number, tf: Timeframe) => {
  const close = new Date(t + IST + durationMs[tf]);
  return close.getUTCHours() * 60 + close.getUTCMinutes();
};

export function isPlanEntryValid(tf: Timeframe, availableT: number, touchT: number, sessionsElapsed: number): boolean {
  if (tf === '1d') return sessionsElapsed <= 3;
  const sameSession = dayBucket(availableT) === dayBucket(touchT);
  return sameSession && barCloseMinute(touchT, tf) <= 915;
}

export function isDailyPlanTimeExit(sessionsHeld: number, tp1Reached: boolean): boolean {
  return !tp1Reached && sessionsHeld >= 10;
}

export function isZoneAvailableAtTouch(invalidatedAt: number | null, touchT: number): boolean {
  return invalidatedAt == null || touchT <= invalidatedAt;
}

export const HTF_MAP: Record<Timeframe, { tf: string; bucket: (t: number) => number }[]> = {
  '5m': [{ tf: '15m', bucket: intradayBucket(900000) }, { tf: '1h', bucket: intradayBucket(3600000) }],
  '15m': [{ tf: '1h', bucket: intradayBucket(3600000) }, { tf: '1d', bucket: dayBucket }],
  '1h': [{ tf: '1d', bucket: dayBucket }, { tf: '1w', bucket: weekBucket }],
  '1d': [{ tf: '1w', bucket: weekBucket }]
};
export const HTF_WEIGHTS = (n: number) => (n === 1 ? [1] : [0.6, 0.4]);

/** Per-base-bar HTF trend using only COMPLETED higher-timeframe bars (no look-ahead). */
export function htfTrendSeries(c: Candle[], tf: Timeframe): number[] {
  const frames = HTF_MAP[tf], wts = HTF_WEIGHTS(frames.length);
  const out = new Array(c.length).fill(0);
  frames.forEach((f, fi) => {
    const hc = resample(c, f.bucket);
    if (hc.length < 55) return;
    const hs = buildSeries(hc);
    const keys = hc.map(x => f.bucket(x.t));
    let h = -1;
    for (let i = 0; i < c.length; i++) {
      const b = f.bucket(c[i].t);
      while (h + 1 < keys.length && keys[h + 1] < b) h++;
      if (h >= 50) out[i] += wts[fi] * htfTrendAt(hs, h);
    }
  });
  return out;
}

export function runBacktest(c: Candle[], tf: Timeframe, opts: { costPct?: number } = {}): BtTrade[] {
  const n = c.length; if (n < 120) return [];
  const intraday = tf !== '1d';
  const costPct = opts.costPct ?? 0.0006;
  const s = buildSeries(c), d = detect(c, s);
  const htf = htfTrendSeries(c, tf);
  const { H, L, O, C, A } = s;
  const sessionAt = new Array<number>(n);
  let session = -1, prevDay = -1;
  for (let i = 0; i < n; i++) {
    const day = dayBucket(c[i].t);
    if (day !== prevDay) { session++; prevDay = day; }
    sessionAt[i] = session;
  }
  const trades: BtTrade[] = [];
  d.zones.forEach((z, zi) => {
    const a = d.zoneIdx[zi].avail;
    if (a < 60) return;
    const bull = z.side === 'bull', sg = bull ? 1 : -1;
    let j = -1;
    for (let m = a + 1; m < n; m++) {
      if (!isPlanEntryValid(tf, c[a].t, c[m].t, sessionAt[m] - sessionAt[a])) break;
      if (!isZoneAvailableAtTouch(z.endT, c[m].t)) break;
      if (bull ? L[m] <= z.top : H[m] >= z.bottom) { j = m; break; }
    }
    if (j < 0) return;
    const i = j - 1;
    const fill = bull ? Math.min(O[j], z.top) : Math.max(O[j], z.bottom);
    const sl = bull ? z.bottom - 0.2 * A[i] : z.top + 0.2 * A[i];
    const risk = (fill - sl) * sg;
    if (risk <= 0.05 * A[i]) return; // gapped beyond stop / degenerate
    const fv = zoneFeatures(z, a, i, s, d, intraday, htf[i] * sg);
    // R-multiple ladder follows live exit sizing; targets are not snapped to live structure/OI levels.
    const tpR = [1, 2, 3], size = [0.5, 0.3, 0.2];
    let filled = 0, stopR = -1, pnl = 0, done = false, mfe = 0, mae = 0, bars = 0, exitIdx = j;
    const remaining = () => 1 - size.slice(0, filled).reduce((x, y) => x + y, 0);
    const closeRemaining = (idx: number) => {
      pnl += ((C[idx] - fill) * sg) / risk * remaining();
      done = true;
      exitIdx = idx;
    };
    const invalidatedAtClose = (idx: number) => bull ? C[idx] < z.bottom : C[idx] > z.top;
    const squareOffAtClose = (idx: number) => intraday &&
      dayBucket(c[idx].t) === dayBucket(c[j].t) && barCloseMinute(c[idx].t, tf) >= 915;

    // The fill bar is treated conservatively: check the original stop, but do not credit targets.
    if (bull ? L[j] <= sl : H[j] >= sl) { pnl = -1; mae = 1; done = true; }
    else if (invalidatedAtClose(j) || squareOffAtClose(j)) closeRemaining(j);
    for (let m = j + 1; !done && m < n; m++) {
      bars = m - j;
      const toR = (p: number) => ((p - fill) * sg) / risk;
      const lowR = toR(bull ? L[m] : H[m]), highR = toR(bull ? H[m] : L[m]);
      mfe = Math.max(mfe, highR); mae = Math.max(mae, -Math.min(0, lowR));
      // conservative: the current stop is assumed to be hit before any target inside the same bar
      if (lowR <= stopR) {
        const exitR = Math.min(stopR, toR(O[m]) < stopR ? toR(O[m]) : stopR); // gap through stop fills at the open
        pnl += exitR * remaining(); mae = Math.max(mae, -Math.min(0, exitR)); done = true; exitIdx = m; break;
      }
      while (filled < 3 && highR >= tpR[filled]) {
        pnl += size[filled] * tpR[filled]; stopR = filled === 0 ? 0 : tpR[filled - 1]; filled++;
        if (filled < 3 && lowR <= stopR) {
          const exitR = Math.min(stopR, toR(O[m]) < stopR ? toR(O[m]) : stopR);
          pnl += exitR * remaining(); done = true; exitIdx = m; break;
        }
      }
      if (done) break;
      if (filled === 3) { done = true; exitIdx = m; break; }
      if (invalidatedAtClose(m) || squareOffAtClose(m) ||
        (tf === '1d' && isDailyPlanTimeExit(sessionAt[m] - sessionAt[j], filled > 0))) {
        closeRemaining(m);
        break;
      }
    }
    if (!done) closeRemaining(n - 1);
    bars = exitIdx - j;
    const costR = (costPct * 2 * fill) / risk;
    trades.push({ t: c[j].t, exitT: c[exitIdx].t, side: z.side, entry: fill, sl, risk, p: predict(tf, fv), hit1R: filled >= 1, hit2R: filled >= 2, hit3R: filled >= 3,
      r2: pnl - costR, mfeR: mfe, maeR: mae, bars, features: fv });
  });
  return trades.sort((x, y) => x.t - y.t);
}

/** Trades Stoclio would actually surface: bias aligned with the zone and not choppy. */
export const isSignal = (t: BtTrade) => t.features[0] >= 0.2 && t.features[1] >= 0.18;

export function summarize(trades: BtTrade[], costPct = 0.0006): BtStats {
  const n = trades.length;
  if (!n) return { trades: 0, hitRate1R: 0, hitRate2R: 0, hitRate3R: 0, winRate2R: 0, expectancy2R: 0, profitFactor: 0, avgMfeR: 0, avgMaeR: 0, maxDrawdownR: 0, avgBars: 0, costR: 0, brier: null, reliability: [] };
  const r = trades.map(t => t.r2);
  const gp = r.filter(x => x > 0).reduce((a, b) => a + b, 0), gl = -r.filter(x => x < 0).reduce((a, b) => a + b, 0);
  let eq = 0, peak = 0, dd = 0; for (const x of r) { eq += x; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const p = trades.map(t => t.p), y = trades.map(t => (t.hit1R ? 1 : 0));
  return {
    trades: n, hitRate1R: mean(y), hitRate2R: mean(trades.map(t => (t.hit2R ? 1 : 0))), hitRate3R: mean(trades.map(t => (t.hit3R ? 1 : 0))),
    winRate2R: r.filter(x => x > 0).length / n, expectancy2R: mean(r),
    profitFactor: gl ? gp / gl : gp ? 99 : 0, avgMfeR: mean(trades.map(t => t.mfeR)), avgMaeR: mean(trades.map(t => t.maeR)),
    maxDrawdownR: dd, avgBars: mean(trades.map(t => t.bars)), costR: mean(trades.map(t => (costPct * 2 * t.entry) / t.risk)),
    brier: brier(p, y), reliability: reliability(p, y)
  };
}

/** History used by the per-stock backtest API and the offline fitting script. */
export const BT_HISTORY: Record<Timeframe, { unit: 'minutes' | 'hours' | 'days'; interval: number; days: number }> = {
  '5m': { unit: 'minutes', interval: 5, days: 90 },
  '15m': { unit: 'minutes', interval: 15, days: 180 },
  '1h': { unit: 'hours', interval: 1, days: 365 },
  '1d': { unit: 'days', interval: 1, days: 3000 }
};
