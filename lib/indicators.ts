import type { Candle } from './types';

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export function mean(a: number[]): number { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

export function ema(src: number[], len: number): (number | null)[] {
  const out: (number | null)[] = new Array(src.length).fill(null);
  if (src.length < len) return out;
  const k = 2 / (len + 1);
  let s = 0;
  for (let i = 0; i < len; i++) s += src[i];
  let prev = s / len; out[len - 1] = prev;
  for (let i = len; i < src.length; i++) { prev = src[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}

/** Wilder ATR series */
export function atr(c: Candle[], len = 14): number[] {
  const out = new Array(c.length).fill(0);
  if (!c.length) return out;
  let prev = c[0].h - c[0].l; out[0] = prev;
  for (let i = 1; i < c.length; i++) {
    const tr = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    prev = i < len ? (prev * i + tr) / (i + 1) : (prev * (len - 1) + tr) / len;
    out[i] = prev;
  }
  return out;
}

/** Wilder RSI series (50 until warm) */
export function rsiSeries(src: number[], len = 14): number[] {
  const out = new Array(src.length).fill(50);
  if (src.length <= len) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= len; i++) { const d = src[i] - src[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= len; l /= len;
  out[len] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = len + 1; i < src.length; i++) {
    const d = src[i] - src[i - 1];
    g = (g * (len - 1) + Math.max(d, 0)) / len;
    l = (l * (len - 1) + Math.max(-d, 0)) / len;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

/** Kaufman efficiency ratio series: 1 = clean trend, 0 = noise */
export function erSeries(src: number[], len = 20): number[] {
  const out = new Array(src.length).fill(0);
  let vol = 0;
  for (let i = 1; i < src.length; i++) {
    vol += Math.abs(src[i] - src[i - 1]);
    if (i > len) vol -= Math.abs(src[i - len] - src[i - len - 1]);
    if (i >= len) out[i] = vol === 0 ? 0 : Math.abs(src[i] - src[i - len]) / vol;
  }
  return out;
}

/** Rolling least-squares slope (price/bar) */
export function slopeSeries(src: number[], len = 20): number[] {
  const out = new Array(src.length).fill(0);
  const xm = (len - 1) / 2;
  let den = 0; for (let i = 0; i < len; i++) den += (i - xm) ** 2;
  for (let e = len - 1; e < src.length; e++) {
    let ym = 0; for (let i = 0; i < len; i++) ym += src[e - len + 1 + i]; ym /= len;
    let num = 0; for (let i = 0; i < len; i++) num += (i - xm) * (src[e - len + 1 + i] - ym);
    out[e] = num / den;
  }
  return out;
}

const istDay = (t: number) => Math.floor((t + 19800000) / 86400000);

/** Session VWAP series, resets every IST day */
export function vwapSeries(c: Candle[]): number[] {
  const out = new Array(c.length).fill(NaN);
  let day = -1, pv = 0, vv = 0;
  for (let i = 0; i < c.length; i++) {
    const d = istDay(c[i].t);
    if (d !== day) { day = d; pv = 0; vv = 0; }
    pv += ((c[i].h + c[i].l + c[i].c) / 3) * c[i].v; vv += c[i].v;
    out[i] = vv > 0 ? pv / vv : c[i].c;
  }
  return out;
}

/** Rolling mean of volume over the previous `len` bars (excluding bar i) */
export function volAvgSeries(v: number[], len = 20): number[] {
  const out = new Array(v.length).fill(1);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    out[i] = i === 0 ? (v[0] || 1) : (s / Math.min(i, len)) || 1;
    s += v[i]; if (i >= len) s -= v[i - len];
  }
  return out;
}

/** Resample candles into groups (e.g. 5m -> 15m) by bucket function */
export function resample(c: Candle[], bucket: (t: number) => number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null, b = NaN;
  for (const x of c) {
    const k = bucket(x.t);
    if (cur && k === b) { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.v += x.v; }
    else { if (cur) out.push(cur); cur = { ...x }; b = k; }
  }
  if (cur) out.push(cur);
  return out;
}
/** IST week bucket (Mon-start) */
export const weekBucket = (t: number) => Math.floor((t + 19800000 + 3 * 86400000) / (7 * 86400000));

export function returns(c: number[]): number[] { const r: number[] = []; for (let i = 1; i < c.length; i++) r.push(c[i - 1] ? Math.log(c[i] / c[i - 1]) : 0); return r; }

/** Pearson correlation + beta of a vs b */
export function corrBeta(a: number[], b: number[]): { corr: number; beta: number } {
  const n = Math.min(a.length, b.length);
  if (n < 10) return { corr: 0, beta: 0 };
  const x = a.slice(-n), y = b.slice(-n);
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return { corr: sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0, beta: syy ? sxy / syy : 0 };
}

/** Align two candle series by timestamp, returning close arrays */
export function alignCloses(a: Candle[], b: Candle[]): [number[], number[]] {
  const m = new Map(b.map(x => [x.t, x.c]));
  const xa: number[] = [], xb: number[] = [];
  for (const x of a) { const v = m.get(x.t); if (v != null) { xa.push(x.c); xb.push(v); } }
  return [xa, xb];
}

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const logit = (p: number) => Math.log(clamp(p, 1e-6, 1 - 1e-6) / (1 - clamp(p, 1e-6, 1 - 1e-6)));
