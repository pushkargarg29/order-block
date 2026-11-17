/** Upstox REST client: rate-limited, cached. Token is read server-side only. */
import type { Candle, Timeframe, OptionWalls } from './types';
import { istDate, istDateMinus, istDayNum, isMarketOpen } from './time';
import { acquire } from './ratelimit';
import { memo } from './cache';
import { unstable_cache } from 'next/cache';
import { resample } from './indicators';

const BASE = 'https://api.upstox.com';
export class UpstoxError extends Error { constructor(message: string, public status = 502) { super(message); } }

function token(): string {
  const t = process.env.UPSTOX_ACCESS_TOKEN;
  if (!t) throw new UpstoxError('Live market data is not configured on the server.', 503);
  return t;
}

export async function get(bucket: string, path: string, attempt = 0): Promise<any> {
  await acquire(bucket);
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (res.status === 429 && attempt < 3) { await new Promise(r => setTimeout(r, 1200 * (attempt + 1))); return get(bucket, path, attempt + 1); }
  if (!res.ok) {
    if (res.status === 401) { console.error('[stoclio] data provider rejected the access token (401)'); throw new UpstoxError('Live market data connection needs to be renewed.', 503); }
    console.error(`[stoclio] data provider HTTP ${res.status} for ${path.split('?')[0]}`);
    throw new UpstoxError('Live market data is temporarily unavailable. Please retry shortly.', 502);
  }
  return res.json();
}

function parse(raw: any): Candle[] {
  const arr: any[] = raw?.data?.candles ?? [];
  return arr.map(r => ({ t: Date.parse(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] || 0, oi: r[6] != null ? +r[6] : undefined }))
    .filter(c => Number.isFinite(c.t) && c.t > 0 && [c.o, c.h, c.l, c.c].every(p => Number.isFinite(p) && p > 0) &&
      c.h >= Math.max(c.o, c.c, c.l) && c.l <= Math.min(c.o, c.c, c.h)).sort((a, b) => a.t - b.t);
}

const enc = encodeURIComponent;
const IST = 19800000, OPEN = 33300000;
const bucketMs = (ms: number) => (t: number) => Math.floor((t + IST - OPEN) / ms);

/** Raw range fetch from the historical API, windowed to Upstox's per-request limits. */
export async function getHistory(key: string, unit: 'minutes' | 'hours' | 'days', interval: number, days: number): Promise<Candle[]> {
  const win = unit === 'days' ? 3600 : unit === 'hours' ? 85 : interval <= 15 ? 28 : 85;
  const out = new Map<number, Candle>();
  let end = Date.now();
  let remaining = days;
  while (remaining > 0) {
    const span = Math.min(win, remaining);
    const raw = await get('historical', `/v3/historical-candle/${enc(key)}/${unit}/${interval}/${istDate(new Date(end))}/${istDateMinus(span - 1, end)}`);
    for (const c of parse(raw)) out.set(c.t, c);
    end -= span * 86400000; remaining -= span;
  }
  return Array.from(out.values()).sort((a, b) => a.t - b.t);
}

/** History up to yesterday: cached for the whole IST day (1 request per stock per day). */
function dayHistory(key: string, unit: 'minutes' | 'days', interval: number, days: number) {
  const id = `hist:${key}:${unit}:${interval}:${days}:${istDate()}`;
  const load = async () => {
    const today = istDayNum(Date.now());
    return (await getHistory(key, unit, interval, days)).filter(c => istDayNum(c.t) < today);
  };
  return memo(id, 20 * 3600000, async () => {
    try { return await unstable_cache(load, ['stoclio-v6', id], { revalidate: 72000 })(); }
    catch { return load(); } // outside Next.js (scripts) or data cache unavailable
  });
}

/** Today's 5-minute candles: one shared request per stock serves 5m/15m/1h. */
export function getToday5m(key: string, ttl = 240000): Promise<Candle[]> {
  return memo(`intra5:${key}`, isMarketOpen() ? ttl : 1800000, async () =>
    parse(await get('intraday', `/v3/historical-candle/intraday/${enc(key)}/minutes/5`)));
}

/** Daily candles (420d) — history cached per day; today's bar is appended from a live quote by the caller. */
export const getDaily = (key: string) => dayHistory(key, 'days', 1, 420);

/** Base intraday series for a timeframe, built from cached 5m history + today's 5m. */
export async function getCandles(key: string, tf: Timeframe, todayTtl?: number): Promise<Candle[]> {
  if (tf === '1d') return getDaily(key);
  const [hist, today] = await Promise.all([dayHistory(key, 'minutes', 5, 28), getToday5m(key, todayTtl).catch(() => [] as Candle[])]);
  const m = new Map<number, Candle>(); for (const c of hist) m.set(c.t, c); for (const c of today) m.set(c.t, c);
  const five = Array.from(m.values()).sort((a, b) => a.t - b.t);
  if (tf === '5m') return five.slice(-1200);
  return resample(five, bucketMs(tf === '15m' ? 900000 : 3600000));
}

/** Patch the forming bar with the latest traded price (keeps analysis live between candle refreshes). */
export function patchLast(c: Candle[], ltp: number | undefined, tf: Timeframe, dayOhlc?: { o: number; h: number; l: number; v: number }): Candle[] {
  if (!ltp || !c.length) return c;
  const out = c.slice();
  const now = Date.now();
  if (tf === '1d') {
    const last = out[out.length - 1];
    const today = istDayNum(now);
    if (istDayNum(last.t) < today && dayOhlc && dayOhlc.o > 0) out.push({ t: Date.parse(istDate() + 'T00:00:00+05:30'), o: dayOhlc.o, h: Math.max(dayOhlc.h, ltp), l: Math.min(dayOhlc.l, ltp), c: ltp, v: dayOhlc.v });
    else if (istDayNum(last.t) === today) out[out.length - 1] = { ...last, c: ltp, h: Math.max(last.h, ltp), l: Math.min(last.l, ltp) };
    return out;
  }
  if (!isMarketOpen()) return out;
  const last = out[out.length - 1];
  out[out.length - 1] = { ...last, c: ltp, h: Math.max(last.h, ltp), l: Math.min(last.l, ltp) };
  return out;
}

export type Quote = { key: string; ltp: number; change: number; changePct: number; open: number; high: number; low: number; prevClose: number; volume: number; oi: number; receivedAt: number };
const nonNegative = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };

async function fetchQuotes(keys: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  for (let i = 0; i < keys.length; i += 450) {
    const chunk = keys.slice(i, i + 450);
    const raw = await get('quotes', `/v2/market-quote/quotes?instrument_key=${chunk.map(enc).join(',')}`);
    const data = raw?.data ?? {};
    const receivedAt = Date.now();
    for (const k of Object.keys(data)) {
      const q = data[k]; const key: string = q.instrument_token ?? k;
      const ltp = Number(q.last_price), change = Number(q.net_change ?? 0), prev = ltp - change;
      if (!Number.isFinite(ltp) || ltp <= 0 || !Number.isFinite(change) || !Number.isFinite(prev) || prev <= 0) continue;
      out.set(key, { key, ltp, change, changePct: (change / prev) * 100, open: nonNegative(q.ohlc?.open), high: nonNegative(q.ohlc?.high),
        low: nonNegative(q.ohlc?.low), prevClose: prev, volume: nonNegative(q.volume), oi: nonNegative(q.oi), receivedAt });
    }
  }
  return out;
}

/** Quotes with a short shared cache: many browsers polling = one upstream request. */
export async function getQuotes(keys: string[], ttl = 4000): Promise<Map<string, Quote>> {
  const sorted = Array.from(new Set(keys)).sort();
  return memo(`q:${sorted.join(',')}`, ttl, () => fetchQuotes(sorted));
}

/** Monthly option chain → OI walls, PCR, max pain, ATM IV. Cached 10 min. */
export function getOptionWalls(underlyingKey: string): Promise<OptionWalls | null> {
  return memo(`oc:${underlyingKey}`, 600000, async () => {
    const raw = await get('optionchain', `/v2/option/chain?instrument_key=${enc(underlyingKey)}&expiry_date=current_month`);
    const rows: any[] = raw?.data ?? [];
    if (!rows.length) return null;
    const spot = +rows[0].underlying_spot_price;
    const strikes = rows.map(r => ({
      k: +r.strike_price,
      cOi: +(r.call_options?.market_data?.oi ?? 0), cPrev: +(r.call_options?.market_data?.prev_oi ?? 0), cIv: +(r.call_options?.option_greeks?.iv ?? 0),
      pOi: +(r.put_options?.market_data?.oi ?? 0), pPrev: +(r.put_options?.market_data?.prev_oi ?? 0), pIv: +(r.put_options?.option_greeks?.iv ?? 0)
    })).filter(s => Number.isFinite(s.k)).sort((a, b) => a.k - b.k);
    const above = strikes.filter(s => s.k >= spot), below = strikes.filter(s => s.k <= spot);
    const cw = above.reduce<typeof strikes[0] | null>((m, s) => (!m || s.cOi > m.cOi ? s : m), null);
    const pw = below.reduce<typeof strikes[0] | null>((m, s) => (!m || s.pOi > m.pOi ? s : m), null);
    const tC = strikes.reduce((a, s) => a + s.cOi, 0), tP = strikes.reduce((a, s) => a + s.pOi, 0);
    let maxPain: number | null = null, best = Infinity;
    for (const K of strikes) {
      let pain = 0; for (const s of strikes) pain += s.cOi * Math.max(0, K.k - s.k) + s.pOi * Math.max(0, s.k - K.k);
      if (pain < best) { best = pain; maxPain = K.k; }
    }
    const atm = strikes.reduce((m, s) => (Math.abs(s.k - spot) < Math.abs(m.k - spot) ? s : m), strikes[0]);
    const ivs = [atm.cIv, atm.pIv].filter(v => v > 0);
    return {
      expiry: String(rows[0].expiry ?? ''), spot,
      callWall: cw && cw.cOi > 0 ? cw.k : null, callWallOi: cw?.cOi ?? 0, putWall: pw && pw.pOi > 0 ? pw.k : null, putWallOi: pw?.pOi ?? 0,
      pcr: tC ? tP / tC : null, maxPain, atmIv: ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null,
      topCalls: [...strikes].sort((a, b) => b.cOi - a.cOi).slice(0, 3).map(s => ({ strike: s.k, oi: s.cOi, chgOi: s.cOi - s.cPrev })),
      topPuts: [...strikes].sort((a, b) => b.pOi - a.pOi).slice(0, 3).map(s => ({ strike: s.k, oi: s.pOi, chgOi: s.pOi - s.pPrev }))
    };
  });
}

/** Previous-session futures OI (from futures daily candles). Cached for the IST day. */
export function getPrevFutOi(futKey: string): Promise<number | null> {
  return memo(`prevoi:${futKey}:${istDate()}`, 20 * 3600000, async () => {
    const raw = await get('historical', `/v3/historical-candle/${enc(futKey)}/days/1/${istDate()}/${istDateMinus(12)}`);
    const today = istDayNum(Date.now());
    const prior = parse(raw).filter(c => istDayNum(c.t) < today && c.oi != null);
    return prior.length ? (prior[prior.length - 1].oi as number) : null;
  });
}
