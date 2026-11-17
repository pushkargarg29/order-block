import { NextRequest } from 'next/server';
import { cachedJson, errorResponse, guard, json, SYMBOL_RE } from '@/lib/guard';
import { getFnoUniverse } from '@/lib/instruments';
import { getQuotes } from '@/lib/upstox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const blocked = guard(req); if (blocked) return blocked;
  const syms = (req.nextUrl.searchParams.get('symbols') ?? '').toUpperCase().split(',').filter(Boolean);
  if (!syms.length || syms.length > 100 || !syms.every(s => SYMBOL_RE.test(s))) return json({ error: 'Invalid symbols' }, 400);
  try {
    const uni = await getFnoUniverse();
    // one shared, 4-second-cached request for the whole universe, regardless of how many visitors poll
    const q = await getQuotes(uni.map(u => u.key));
    const bySym = new Map(uni.map(u => [u.symbol, u.key]));
    const out: Record<string, { ltp: number; changePct: number }> = {};
    for (const s of syms) { const k = bySym.get(s); const v = k ? q.get(k) : undefined; if (v) out[s] = { ltp: v.ltp, changePct: v.changePct }; }
    const at = Array.from(q.values()).reduce<number | null>((oldest, quote) => oldest == null ? quote.receivedAt : Math.min(oldest, quote.receivedAt), null);
    const coverage = syms.length ? Object.keys(out).length / syms.length : 0;
    return cachedJson({ at, coverage, quotes: out }, 3, 30);
  } catch (e) {
    return errorResponse(e);
  }
}
