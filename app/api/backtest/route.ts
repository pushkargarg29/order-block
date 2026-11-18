import { NextRequest } from 'next/server';
import { errorResponse, guard, json, SYMBOL_RE } from '@/lib/guard';
import { findSymbol } from '@/lib/instruments';
import { getHistory } from '@/lib/upstox';
import { runBacktest, summarize, isSignal, BT_HISTORY as HISTORY } from '@/lib/backtest';
import { modelInfo } from '@/lib/model';
import { memo } from '@/lib/cache';
import { isTimeframe } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;


export async function GET(req: NextRequest) {
  const blocked = await guard(req); if (blocked) return blocked;
  const sp = req.nextUrl.searchParams;
  const symbol = (sp.get('symbol') ?? '').toUpperCase();
  const tf = sp.get('tf') ?? '15m';
  if (!SYMBOL_RE.test(symbol)) return json({ error: 'Invalid symbol' }, 400);
  if (!isTimeframe(tf)) return json({ error: 'Invalid timeframe' }, 400);
  try {
    const inst = await findSymbol(symbol);
    if (!inst) return json({ error: 'Symbol is not an active F&O stock' }, 404);
    const res = await memo(`bt:${symbol}:${tf}`, 6 * 3600000, async () => {
      const h = HISTORY[tf];
      const candles = await getHistory(inst.key, h.unit, h.interval, h.days);
      const trades = runBacktest(candles, tf);
      const signals = trades.filter(isSignal);
      return {
        symbol, tf, bars: candles.length, from: candles[0]?.t ?? null, to: candles[candles.length - 1]?.t ?? null,
        all: summarize(trades), signals: summarize(signals),
        recent: signals.slice(-40).reverse().map(({ features, ...t }) => t)
      };
    });
    return json({ ...res, model: modelInfo(tf), costPctPerSide: 0.06 });
  } catch (e) {
    return errorResponse(e);
  }
}
