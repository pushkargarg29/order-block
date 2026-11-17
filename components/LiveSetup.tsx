'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Analysis, Candle, ScanRow } from '@/lib/types';
import CandleChart from './CandleChart';
import { f2, pct } from './fmt';
import { isMarketOpen } from '@/lib/time';

export type Top = { row: ScanRow | null; candles: Candle[]; analysis: Analysis | null; at: number };

/** Homepage hero: the current #1 ranked setup and its chart, delivered in a single edge-cached request. */
export default function LiveSetup({ initial = null }: { initial?: Top | null }) {
  const [d, setD] = useState<Top | null>(initial);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = () => fetch('/api/top')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((j: Top) => { if (!stop) { setD(j); setErr(false); } })
      .catch(() => { if (!stop) setErr(true); });
    if (!initial || Date.now() - initial.at > 5000) load();
    const id = setInterval(() => { if (isMarketOpen() && document.visibilityState === 'visible') load(); }, 5000);
    return () => { stop = true; clearInterval(id); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const row = d?.row ?? null, a = d?.analysis ?? null;
  const bull = row?.bias === 'bullish';
  const state = err && !d ? 'error' : !d ? 'loading' : !row ? 'empty' : 'ready';

  return (
    <>
      <div className="setup-head">
        {row ? (
          <>
            <b className="setup-sym">{row.symbol}</b><span className="mono muted">{f2(row.ltp)}</span>
            <span className={`mono ${(row.changePct ?? 0) >= 0 ? 'bull' : 'bear'}`}>{pct(row.changePct)}</span>
            <span className="spacer" /><span className="pill neutp">Live · 15m</span>
            <span className={`pill ${bull ? 'bullp' : 'bearp'}`}>#1 {bull ? 'Bullish' : 'Bearish'} · Score {row.score}</span>
          </>
        ) : state === 'loading' ? <span className="muted">Loading live market data…</span> : null}
      </div>
      {state === 'ready' && row && d!.candles.length ? (
        <Link href={`/chart/${encodeURIComponent(row.symbol)}?tf=15m`} aria-label={`Open ${row.symbol} chart`}>
          <CandleChart candles={d!.candles} a={a} showFvg={false} showEma={false} showPlan={false} daily={false}
            walls={null} showWalls={false} initialCount={60} interactive={false} height={300} />
        </Link>
      ) : state === 'loading' ? <div className="skeleton" style={{ height: 300 }} />
        : <div className="notice" style={{ minHeight: 120 }}>{state === 'empty' ? 'No qualifying order-block setup right now. The Liquidity Board shows the full scan.' : 'Live data is temporarily unavailable. Please retry shortly.'}</div>}
      {row && (
        <div className="kv kv-3" style={{ marginTop: 14 }}>
          <div><small>Order block</small><b className={bull ? 'bull' : 'bear'}>{row.zone ? `${f2(row.zone.bottom)}–${f2(row.zone.top)}` : '—'}</b></div>
          <div><small>{bull ? 'Support' : 'Resistance'}</small><b>{f2(bull ? (a?.support ?? row.support) : (a?.resistance ?? row.resistance))}</b></div>
          <div><small>Liquidity</small><b className="gold">{f2(a?.liquidityLevel ?? row.liquidity)}</b></div>
        </div>
      )}
    </>
  );
}
