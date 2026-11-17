import { NextRequest } from 'next/server';
import { cachedJson, errorResponse, guard, json } from '@/lib/guard';
import { getScan } from '@/lib/snapshot';
import { isTimeframe } from '@/lib/types';
import { isMarketOpen } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const blocked = guard(req); if (blocked) return blocked;
  const tf = req.nextUrl.searchParams.get('tf') ?? '15m';
  if (!isTimeframe(tf)) return json({ error: 'Invalid timeframe' }, 400);
  try { return cachedJson(await getScan(tf), isMarketOpen() ? 20 : 300, 86400); }
  catch (e) { return errorResponse(e); }
}
