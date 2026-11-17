import { NextRequest } from 'next/server';
import { cachedJson, errorResponse, guard, json } from '@/lib/guard';
import { getFnoUniverse } from '@/lib/instruments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const blocked = guard(req); if (blocked) return blocked;
  try {
    const u = await getFnoUniverse();
    return cachedJson({ count: u.length, symbols: u.map(x => ({ symbol: x.symbol, name: x.name, lot: x.lot })) }, 3600, 86400);
  } catch (e) { return errorResponse(e); }
}
