import { NextRequest } from 'next/server';
import { cachedJson, errorResponse, guard } from '@/lib/guard';
import { getTop } from '@/lib/snapshot';
import { isMarketOpen } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Homepage hero in ONE request: the #1 ranked setup plus its recent candles and zones. */
export async function GET(req: NextRequest) {
  const blocked = guard(req); if (blocked) return blocked;
  try { return cachedJson(await getTop(), isMarketOpen() ? 20 : 300, 86400); }
  catch (e) { return errorResponse(e); }
}
