import { NextRequest } from 'next/server';
import { cachedJson, errorResponse, guard, json, SYMBOL_RE } from '@/lib/guard';
import { getChart } from '@/lib/snapshot';
import { isTimeframe } from '@/lib/types';
import { isMarketOpen } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const blocked = guard(req); if (blocked) return blocked;
  const sp = req.nextUrl.searchParams;
  const symbol = (sp.get('symbol') ?? '').toUpperCase();
  const tf = sp.get('tf') ?? '15m';
  if (!SYMBOL_RE.test(symbol)) return json({ error: 'Invalid symbol' }, 400);
  if (!isTimeframe(tf)) return json({ error: 'Invalid timeframe' }, 400);
  try {
    const d = await getChart(symbol, tf);
    if (!d) return json({ error: 'Symbol is not an active F&O stock' }, 404);
    return cachedJson(d, isMarketOpen() ? 10 : 300, 3600);
  } catch (e) { return errorResponse(e); }
}
