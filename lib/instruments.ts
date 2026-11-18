import { gunzipSync } from 'zlib';
import { memo } from './cache';
import { unstable_cache } from 'next/cache';

export type Instrument = { symbol: string; name: string; key: string; lot: number; futKey: string | null; futExpiry: number | null };
const URL = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';

export const INDEX = { NIFTY: 'NSE_INDEX|Nifty 50', BANKNIFTY: 'NSE_INDEX|Nifty Bank', VIX: 'NSE_INDEX|India VIX' } as const;

async function load(): Promise<Instrument[]> {
  const res = await fetch(URL, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`instrument list HTTP ${res.status}`);
  const rows: any[] = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8'));
  // roll to next month when near-month expires within ~1 day (expiry-day OI collapses)
  const cutoff = Date.now() + 36 * 3600000;
  const fut = new Map<string, { symbol: string; lot: number; key: string; exp: number }>();
  for (const r of rows) {
    if (r.segment !== 'NSE_FO' || r.instrument_type !== 'FUT' || typeof r.underlying_key !== 'string' || !r.underlying_key.startsWith('NSE_EQ|')) continue;
    const exp = +r.expiry || 0;
    if (exp && exp < Date.now() - 86400000) continue;
    const cur = fut.get(r.underlying_key);
    const better = !cur || (exp >= cutoff && (cur.exp < cutoff || exp < cur.exp)) || (cur.exp < cutoff && exp > cur.exp);
    if (better) fut.set(r.underlying_key, { symbol: r.underlying_symbol || r.asset_symbol, lot: r.lot_size || 0, key: r.instrument_key, exp });
  }
  const names = new Map<string, { sym: string; name: string }>();
  for (const r of rows) if (r.segment === 'NSE_EQ' && fut.has(r.instrument_key)) names.set(r.instrument_key, { sym: r.trading_symbol, name: r.name });
  const list: Instrument[] = [];
  fut.forEach((v, key) => {
    const n = names.get(key); const symbol = (n?.sym || v.symbol || '').toUpperCase();
    if (symbol) list.push({ symbol, name: n?.name || symbol, key, lot: v.lot, futKey: v.key || null, futExpiry: v.exp || null });
  });
  list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  if (list.length < 50) throw new Error('Unexpected instrument master format');
  return list;
}

/** All NSE equities with active stock futures (the F&O universe). Cached 6h. */
const loadShared = () => process.env.NEXT_RUNTIME === 'nodejs'
  ? unstable_cache(load, ['stoclio-universe-v8'], { revalidate: 21600 })()
  : load();
export const getFnoUniverse = () => memo('universe', 6 * 3600000, loadShared);
export async function findSymbol(symbol: string) { return (await getFnoUniverse()).find(i => i.symbol === symbol.toUpperCase()); }
