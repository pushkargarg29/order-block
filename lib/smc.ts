/**
 * Stoclio Order-Block & Liquidity engine (Smart-Money-Concepts, quantified).
 * One detection pass (`detect`) is shared by the live analyser and the backtester,
 * so live scores and backtest statistics are computed with identical rules.
 * No look-ahead: pivots are used only after confirmation (k bars), zones become
 * tradable only at `availT` (2 bars after the structure break, when displacement is known).
 */
import type { Analysis, Candle, FVG, LiquidityPool, Side, StructureEvent, Sweep, Zone, TradePlan, Bias, TpLevel, TpSource } from './types';
import { atr, clamp, ema, erSeries, mean, rsiSeries, slopeSeries, volAvgSeries, vwapSeries, sigmoid } from './indicators';
import { predict, FEATURE_NAMES } from './model';

type Pivot = { i: number; p: number };

export type Series = {
  H: number[]; L: number[]; C: number[]; O: number[]; V: number[]; A: number[];
  e20: (number | null)[]; e50: (number | null)[]; rsi: number[]; er: number[]; slope: number[];
  vwap: number[]; vavg: number[]; vavg50: number[];
};

export function buildSeries(c: Candle[]): Series {
  const C = c.map(x => x.c), V = c.map(x => x.v);
  return {
    H: c.map(x => x.h), L: c.map(x => x.l), C, O: c.map(x => x.o), V, A: atr(c, 14),
    e20: ema(C, 20), e50: ema(C, 50), rsi: rsiSeries(C, 14), er: erSeries(C, 20), slope: slopeSeries(C, 20),
    vwap: vwapSeries(c), vavg: volAvgSeries(V, 20), vavg50: volAvgSeries(V, 50)
  };
}

export type Detection = {
  pivH: Pivot[]; pivL: Pivot[]; zones: Zone[]; zoneIdx: { avail: number; brk: number; ob: number }[];
  events: StructureEvent[]; trendAt: number[]; sweepEvents: { i: number; side: 'buy' | 'sell'; price: number }[];
};

export function detect(c: Candle[], s: Series, k = 3): Detection {
  const n = c.length, { H, L, C, O, V, A } = s;
  const pivH: Pivot[] = [], pivL: Pivot[] = [];
  for (let i = k; i < n - k; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= k; j++) {
      if (H[i] <= H[i - j] || H[i] < H[i + j]) isH = false;
      if (L[i] >= L[i - j] || L[i] > L[i + j]) isL = false;
    }
    if (isH) pivH.push({ i, p: H[i] });
    if (isL) pivL.push({ i, p: L[i] });
  }

  const zones: Zone[] = [], zoneIdx: Detection['zoneIdx'] = [], events: StructureEvent[] = [];
  const trendAt = new Array(n).fill(0);
  let trend = 0, hp = 0, lp = 0;
  let curH: (Pivot & { broken: boolean }) | null = null, curL: (Pivot & { broken: boolean }) | null = null;

  const makeZone = (side: Side, ob: number, brk: number) => {
    let top = H[ob], bottom = L[ob];
    if (top - bottom > 2 * (A[ob] || 1e-9)) { if (side === 'bull') top = Math.max(O[ob], C[ob]); else bottom = Math.min(O[ob], C[ob]); }
    const end = Math.min(n - 1, brk + 2);
    let ext = side === 'bull' ? -Infinity : Infinity;
    for (let j = ob + 1; j <= end; j++) ext = side === 'bull' ? Math.max(ext, H[j]) : Math.min(ext, L[j]);
    const disp = Math.max(0, side === 'bull' ? ext - top : bottom - ext) / (A[brk] || 1e-9);
    const rv = mean(V.slice(ob, brk + 1)) / (s.vavg[ob] || 1);
    let fvg = false;
    for (let j = ob + 2; j <= Math.min(n - 1, brk + 1); j++) if (side === 'bull' ? L[j] > H[j - 2] : H[j] < L[j - 2]) { fvg = true; break; }
    const strength = clamp(0.5 * Math.tanh(disp / 2.5) + 0.3 * clamp((rv - 0.6) / 1.4, 0, 1) + 0.2 * (fvg ? 1 : 0), 0, 1);
    const avail = Math.min(n - 1, brk + 2);
    zones.push({ id: `${side}-${c[ob].t}`, side, top, bottom, startT: c[ob].t, breakT: c[brk].t, availT: c[avail].t, endT: null,
      strength, displacementATR: disp, rvol: rv, hasFVG: fvg, touches: 0, invalidated: false });
    zoneIdx.push({ avail, brk, ob });
  };

  for (let i = 0; i < n; i++) {
    while (hp < pivH.length && pivH[hp].i + k <= i) { curH = { ...pivH[hp], broken: false }; hp++; }
    while (lp < pivL.length && pivL[lp].i + k <= i) { curL = { ...pivL[lp], broken: false }; lp++; }
    if (curH && !curH.broken && C[i] > curH.p) {
      curH.broken = true;
      events.push({ kind: trend < 0 ? 'CHoCH' : 'BOS', dir: 'bull', level: curH.p, t: c[i].t, pivotT: c[curH.i].t });
      trend = 1;
      let ob = -1; const lo = Math.max(curH.i - k, i - 40, 0);
      for (let j = i - 1; j >= lo; j--) if (C[j] < O[j] && (ob < 0 || L[j] < L[ob])) ob = j;
      if (ob < 0) for (let j = i - 1; j >= lo; j--) if (ob < 0 || L[j] < L[ob]) ob = j;
      if (ob >= 0 && !zones.some(z => z.startT === c[ob].t && z.side === 'bull')) makeZone('bull', ob, i);
    }
    if (curL && !curL.broken && C[i] < curL.p) {
      curL.broken = true;
      events.push({ kind: trend > 0 ? 'CHoCH' : 'BOS', dir: 'bear', level: curL.p, t: c[i].t, pivotT: c[curL.i].t });
      trend = -1;
      let ob = -1; const lo = Math.max(curL.i - k, i - 40, 0);
      for (let j = i - 1; j >= lo; j--) if (C[j] > O[j] && (ob < 0 || H[j] > H[ob])) ob = j;
      if (ob < 0) for (let j = i - 1; j >= lo; j--) if (ob < 0 || H[j] > H[ob]) ob = j;
      if (ob >= 0 && !zones.some(z => z.startT === c[ob].t && z.side === 'bear')) makeZone('bear', ob, i);
    }
    trendAt[i] = trend;
  }

  // mitigation / invalidation
  zones.forEach((z, zi) => {
    const a = zoneIdx[zi].avail;
    let inside = false;
    for (let j = a + 1; j < n; j++) {
      const hit = z.side === 'bull' ? L[j] <= z.top : H[j] >= z.bottom;
      if (hit && !inside) z.touches++;
      inside = hit;
      if (z.side === 'bull' ? C[j] < z.bottom : C[j] > z.top) { z.invalidated = true; z.endT = c[j].t; break; }
    }
  });

  // liquidity sweeps (first breach of a confirmed pivot that closes back inside)
  const sweepEvents: Detection['sweepEvents'] = [];
  for (const side of ['buy', 'sell'] as const) {
    for (const p of side === 'buy' ? pivH : pivL) {
      for (let j = p.i + k + 1; j < n; j++) {
        const through = side === 'buy' ? H[j] > p.p : L[j] < p.p;
        if (!through) continue;
        if (side === 'buy' ? C[j] < p.p : C[j] > p.p) sweepEvents.push({ i: j, side, price: p.p });
        break;
      }
    }
  }
  sweepEvents.sort((a, b) => a.i - b.i);
  return { pivH, pivL, zones, zoneIdx, events, trendAt, sweepEvents };
}

/** Weighted bias model at bar i (-1 bearish … +1 bullish) */
export function biasAt(s: Series, trendAt: number[], i: number, intraday: boolean): number {
  const last = s.C[i], atrL = s.A[i] || last * 0.01;
  const E20 = s.e20[i] ?? last, E50 = s.e50[i] ?? last;
  const emaAlign = (E20 > E50 ? 0.5 : -0.5) + (last > E20 ? 0.5 : -0.5);
  const slopeN = clamp((s.slope[i] * 20) / atrL / 3, -1, 1);
  const rsiN = clamp((s.rsi[i] - 50) / 25, -1, 1);
  const vw = intraday ? (last > s.vwap[i] ? 1 : -1) : emaAlign;
  return clamp(0.3 * trendAt[i] + 0.2 * emaAlign + 0.2 * slopeN + 0.15 * rsiN + 0.15 * vw, -1, 1);
}

/** Simple, robust higher-timeframe trend (-1 … +1). Same definition live and in backtest. */
export function htfTrendAt(s: Series, i: number): number {
  const last = s.C[i], E20 = s.e20[i], E50 = s.e50[i];
  if (E20 == null || E50 == null) return 0;
  const atrL = s.A[i] || last * 0.01;
  const emaAlign = (E20 > E50 ? 0.5 : -0.5) + (last > E20 ? 0.5 : -0.5);
  const slopeN = clamp((s.slope[i] * 20) / atrL / 3, -1, 1);
  const rsiN = clamp((s.rsi[i] - 50) / 25, -1, 1);
  return clamp(0.5 * emaAlign + 0.3 * slopeN + 0.2 * rsiN, -1, 1);
}
export function htfTrend(c: Candle[]): number {
  if (c.length < 55) return 0;
  return htfTrendAt(buildSeries(c), c.length - 1);
}

/**
 * Model feature vector for a zone evaluated at bar i (uses data up to i only).
 * Order must match FEATURE_NAMES in model.ts.
 */
export function zoneFeatures(z: Zone, availIdx: number, i: number, s: Series, d: Detection, intraday: boolean, htfAlign: number): number[] {
  const sg = z.side === 'bull' ? 1 : -1;
  const atrI = s.A[i] || 1e-9;
  const vNow = mean(s.V.slice(Math.max(0, i - 4), i + 1)) / (s.vavg50[Math.max(0, i - 4)] || 1);
  const want = z.side === 'bull' ? 'sell' : 'buy';
  const sweep = d.sweepEvents.some(e => e.side === want && e.i <= i && e.i >= i - 15) ? 1 : 0;
  return [
    biasAt(s, d.trendAt, i, intraday) * sg,
    s.er[i],
    Math.tanh(z.displacementATR / 2.5),
    clamp((z.rvol - 0.6) / 1.4, 0, 1),
    z.hasFVG ? 1 : 0,
    Math.log1p(Math.max(0, i - availIdx)) / Math.log(200),
    clamp(vNow / 2, 0, 1.5),
    sweep,
    htfAlign,
    ((s.rsi[i] - 50) / 50) * sg,
    clamp((z.top - z.bottom) / atrI, 0, 3) / 3
  ];
}

export function analyze(c: Candle[], opts: { swing?: number; intraday?: boolean; tf?: string; htfAlign?: number } = {}): Analysis | null {
  const n = c.length;
  if (n < 60) return null;
  const intraday = !!opts.intraday;
  const s = buildSeries(c);
  const d = detect(c, s, opts.swing ?? 3);
  const { H, L, C, V, A } = s;
  const last = C[n - 1], atrL = A[n - 1] || last * 0.01;

  // freshness decay for display strength
  for (const z of d.zones) z.strength = clamp(z.strength * (1 - 0.15 * Math.min(z.touches, 3)), 0, 1);

  const fvgs: FVG[] = [];
  for (let i = 2; i < n; i++) {
    const thr = 0.15 * A[i];
    let g: FVG | null = null;
    if (L[i] - H[i - 2] > thr) g = { side: 'bull', top: L[i], bottom: H[i - 2], t: c[i - 1].t, filled: false };
    else if (L[i - 2] - H[i] > thr) g = { side: 'bear', top: L[i - 2], bottom: H[i], t: c[i - 1].t, filled: false };
    if (!g) continue;
    for (let j = i + 1; j < n; j++) if (g.side === 'bull' ? L[j] <= g.bottom : H[j] >= g.top) { g.filled = true; break; }
    fvgs.push(g);
  }

  // liquidity pools (unswept pivots, clustered as equal highs/lows)
  const sweptSet = new Set<number>();
  const unswept = (side: 'buy' | 'sell') => (side === 'buy' ? d.pivH : d.pivL).filter(p => {
    for (let j = p.i + 1; j < n; j++) if (side === 'buy' ? H[j] > p.p : L[j] < p.p) { sweptSet.add(p.i); return false; }
    return true;
  });
  const cluster = (ps: Pivot[], side: 'buy' | 'sell'): LiquidityPool[] => {
    const tol = 0.25 * atrL, pools: LiquidityPool[] = [];
    for (const p of [...ps].sort((a, b) => a.p - b.p)) {
      const lp = pools[pools.length - 1];
      if (lp && Math.abs(p.p - lp.price) <= tol) { lp.price = side === 'buy' ? Math.max(lp.price, p.p) : Math.min(lp.price, p.p); lp.count++; lp.t = Math.max(lp.t, c[p.i].t); }
      else pools.push({ side, price: p.p, count: 1, t: c[p.i].t });
    }
    return pools;
  };
  const bsl = cluster(unswept('buy'), 'buy').filter(p => p.price > last);
  const ssl = cluster(unswept('sell'), 'sell').filter(p => p.price < last);
  const sweeps: Sweep[] = d.sweepEvents.filter(e => e.i >= n - 15).map(e => ({ side: e.side, price: e.price, t: c[e.i].t }));

  const recentH = d.pivH.filter(p => p.i >= n - 150).map(p => p.p).filter(p => p > last);
  const recentL = d.pivL.filter(p => p.i >= n - 150).map(p => p.p).filter(p => p < last);
  const resistance = recentH.length ? Math.min(...recentH) : Math.max(...H.slice(-60));
  const support = recentL.length ? Math.max(...recentL) : Math.min(...L.slice(-60));

  const biasScore = biasAt(s, d.trendAt, n - 1, intraday);
  const er = s.er[n - 1];
  const choppy = er < 0.18 || Math.abs(biasScore) < 0.2;
  const bias: Bias = choppy ? 'neutral' : biasScore > 0 ? 'bullish' : 'bearish';
  const side: Side = biasScore >= 0 ? 'bull' : 'bear';

  const cand = d.zones.map((z, zi) => ({ z, zi })).filter(({ z, zi }) => !z.invalidated && z.side === side && d.zoneIdx[zi].avail < n - 1 &&
    (side === 'bull' ? z.bottom < last + 0.25 * atrL : z.top > last - 0.25 * atrL));
  const dist = (z: Zone) => side === 'bull' ? Math.max(0, last - z.top) / atrL : Math.max(0, z.bottom - last) / atrL;
  cand.sort((a, b) => dist(a.z) - dist(b.z));
  const act = cand[0] ?? null;
  const activeZone = act?.z ?? null;
  const proximity = activeZone ? Math.exp(-dist(activeZone) / 2) : 0;

  let pModel: number | null = null, features: Record<string, number> | null = null;
  if (act) {
    const fv = zoneFeatures(act.z, d.zoneIdx[act.zi].avail, n - 1, s, d, intraday, opts.htfAlign ?? 0);
    pModel = predict(opts.tf ?? '15m', fv);
    features = Object.fromEntries(FEATURE_NAMES.map((k, i) => [k, +fv[i].toFixed(4)]));
  }
  const score = pModel != null ? Math.round(pModel * 100) : Math.round(35 * Math.abs(biasScore));
  const rank = Math.round(score * (0.55 + 0.45 * proximity));

  const liquidityLevel = side === 'bull'
    ? ([...ssl].filter(p => p.price < support).sort((a, b) => b.price - a.price)[0]?.price ?? [...ssl].sort((a, b) => b.price - a.price)[0]?.price ?? null)
    : ([...bsl].filter(p => p.price > resistance).sort((a, b) => a.price - b.price)[0]?.price ?? [...bsl].sort((a, b) => a.price - b.price)[0]?.price ?? null);

  const levels: PlanLevel[] = [
    ...bsl.map(p => ({ price: p.price, source: 'Liquidity' as const })), ...ssl.map(p => ({ price: p.price, source: 'Liquidity' as const })),
    ...d.pivH.filter(p => p.i >= n - 300).map(p => ({ price: p.p, source: 'Structure' as const })),
    ...d.pivL.filter(p => p.i >= n - 300).map(p => ({ price: p.p, source: 'Structure' as const }))
  ];
  const plan = buildPlan(side, last, atrL, activeZone, support, resistance, levels, choppy, intraday);
  const rvol = mean(V.slice(-5)) / (mean(V.slice(-55, -5)) || 1);
  const firstT = c[Math.max(0, n - 400)].t;
  return {
    last, atr: atrL, rsi: s.rsi[n - 1], ema20: s.e20[n - 1] ?? last, ema50: s.e50[n - 1] ?? last, vwap: intraday ? s.vwap[n - 1] : null,
    er, rvol, trend: d.trendAt[n - 1], biasScore, bias, choppy, pModel, score, rank, proximity,
    zones: d.zones.filter(z => (z.endT ?? Infinity) >= firstT).slice(-24), activeZone, fvgs: fvgs.filter(f => !f.filled).slice(-10),
    liquidity: [...bsl, ...ssl], sweeps, events: d.events.slice(-12), support, resistance, liquidityLevel, plan,
    ema20Series: s.e20, ema50Series: s.e50, features,
    planLevels: levels.filter(l => l.source === 'Structure')
  };
}

export type PlanLevel = { price: number; source: TpSource };

/**
 * Rule-based trade plan with a 3-target ladder.
 * Entry: limit at the order-block edge (or market if price is already inside).
 * Stop: beyond the far edge of the block ± 0.2 ATR.
 * TP1 ≥ 1R, TP2 ≥ 2R, TP3 ≥ 3R — each snapped to the nearest real level (liquidity, structure, OI wall) lying within
 * +1.25R of that multiple; otherwise the exact R-multiple is used. Targets are strictly increasing (≥ 0.5R apart).
 */
export function buildPlan(side: Side, last: number, atrL: number, z: Zone | null, support: number, resistance: number,
  levels: PlanLevel[], choppy: boolean, intraday: boolean): TradePlan {
  if (choppy || !(atrL > 0)) return null;
  const bull = side === 'bull', sg = bull ? 1 : -1;
  const entry = z ? (bull ? Math.min(last, z.top) : Math.max(last, z.bottom)) : last;
  const invalidation = z ? (bull ? z.bottom : z.top) : bull ? support : resistance;
  const sl = invalidation - sg * 0.2 * atrL;
  const risk = (entry - sl) * sg;
  if (!(risk > 0.15 * atrL) || risk > 4 * atrL) return null; // degenerate or too wide to be a sensible trade
  const R = (p: number) => ((p - entry) * sg) / risk;
  const cands = levels
    .filter(l => Number.isFinite(l.price) && R(l.price) > 0 && R(l.price) <= 8)
    .sort((a, b) => R(a.price) - R(b.price))
    .filter((l, k, arr) => k === 0 || Math.abs(l.price - arr[k - 1].price) > 0.25 * atrL);
  const tps: TpLevel[] = [];
  let floor = 1;
  for (let k = 0; k < 3; k++) {
    const minR = Math.max(k + 1, floor);
    // snap to a real level only if it sits within +1.25R of the required multiple; otherwise use the exact R-multiple
    const hit = cands.find(l => R(l.price) >= minR && R(l.price) <= minR + 1.25);
    const tp: TpLevel = hit ? { price: hit.price, r: R(hit.price), source: hit.source } : { price: entry + sg * minR * risk, r: minR, source: 'R-multiple' };
    tps.push(tp);
    floor = tp.r + 0.5;
  }
  const inZone = z ? last <= z.top + 0.1 * atrL && last >= z.bottom - 0.1 * atrL : true;
  const distPct = (Math.abs(last - entry) / last) * 100;
  const fmt = (x: number) => x.toFixed(2);
  const exitRules = [
    `Book 50% at TP1 (${fmt(tps[0].price)}) and move the stop to entry.`,
    `Book 30% at TP2 (${fmt(tps[1].price)}) and trail the stop to TP1.`,
    `Exit the final 20% at TP3 (${fmt(tps[2].price)}).`,
    `Invalidation: exit if a candle closes ${bull ? 'below' : 'above'} ${fmt(invalidation)}, even before the stop.`,
    intraday ? 'Square off anything still open by 15:15 IST.' : 'Exit if TP1 is not reached within 10 sessions.',
    'Skip the trade if price gaps beyond the stop.'
  ];
  return {
    side, entry, sl, target: tps[0].price, rr: tps[0].r, risk, riskPct: (risk / entry) * 100, tps,
    trigger: inZone ? 'at-entry' : 'pullback', distPct, invalidation,
    validity: intraday ? 'Pending entry valid until 15:15 IST today' : 'Pending entry valid for 3 sessions', exitRules
  };
}

export { sigmoid };
