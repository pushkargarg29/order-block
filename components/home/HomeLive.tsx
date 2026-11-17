'use client';
import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import type { ScanRow } from '@/lib/types';
import { useScan, useLiveQuotes } from '../useScan';
import LiveBadge from '../LiveBadge';
import { f2, pct } from '../fmt';
import { fmtIST } from '@/lib/time';

const chg = (x: number | null | undefined) => <span className={`mono ${(x ?? 0) >= 0 ? 'bull' : 'bear'}`}>{pct(x)}</span>;

/** Live market strip: indices, VIX, scan breadth, model status. */
export function LivePulse() {
  const { data, error } = useScan('15m');
  const r = data?.regime;
  const counts = useMemo(() => {
    const rows = data?.rows ?? [];
    return { bull: rows.filter(x => x.bias === 'bullish' && !x.choppy).length, bear: rows.filter(x => x.bias === 'bearish' && !x.choppy).length, chop: rows.filter(x => x.choppy || x.bias === 'neutral').length };
  }, [data]);
  if (error && !data) return <div className="notice err">⚠ {error}</div>;
  const cell = (k: string, v: ReactNode, s?: ReactNode) => <div className="pulse-cell"><small>{k}</small><b>{v}</b>{s && <span>{s}</span>}</div>;
  return (
    <>
      {error && data && <div className="notice err pulse-error">⚠ {error} Showing the last available scan.</div>}
      <div className="pulse-status"><LiveBadge at={data?.quoteAt === undefined ? data?.at : data.quoteAt} coverage={data?.quoteCoverage} sampleLabel="Quotes sampled" /></div>
      <div className="card glass pulse" aria-live="polite">
        {cell('NIFTY 50', data ? <span className="mono">{f2(r?.nifty.ltp)}</span> : '—', r ? chg(r.nifty.chgPct) : null)}
        {cell('BANK NIFTY', data ? <span className="mono">{f2(r?.bank.ltp)}</span> : '—', r ? chg(r.bank.chgPct) : null)}
        {cell('INDIA VIX', data ? <span className={`mono ${r?.vix.level === 'high' ? 'bear' : r?.vix.level === 'elevated' ? 'gold' : ''}`}>{f2(r?.vix.ltp)}</span> : '—', r?.vix.level && r.vix.level !== 'unknown' ? <span className="dim">{r.vix.level}</span> : null)}
        {cell('Scanned', data ? <span className="mono">{data.scanned}<span className="dim">/{data.total}</span></span> : '—', <span className="dim">F&amp;O stocks · 15m</span>)}
        {cell('Bullish', data ? <span className="mono bull">{counts.bull}</span> : '—', <span className="dim">clean setups</span>)}
        {cell('Bearish', data ? <span className="mono bear">{counts.bear}</span> : '—', <span className="dim">clean setups</span>)}
        {cell('Range-bound', data ? <span className="mono muted">{counts.chop}</span> : '—', <span className="dim">filtered out</span>)}
        {cell('Updated', data ? <span className="mono">{fmtIST(data.at)}</span> : '—', data ? <span className={data.model.calibrated ? 'bull' : 'dim'}>{data.model.calibrated ? 'model calibrated' : 'model uncalibrated'}</span> : null)}
      </div>
    </>
  );
}

function LeaderList({ rows, side, live }: { rows: ScanRow[]; side: 'bull' | 'bear'; live: Record<string, { ltp: number; changePct: number }> }) {
  return (
    <div className="card glass leaders">
      <h3 className={side}>{side === 'bull' ? '↗ Strongest bullish' : '↘ Strongest bearish'}</h3>
      {rows.length === 0 ? <p className="muted" style={{ marginTop: 12 }}>No clean {side === 'bull' ? 'bullish' : 'bearish'} setups right now.</p> : (
        <ol>
          {rows.map((r, i) => {
            const q = live[r.symbol];
            return (
              <li key={r.symbol}>
                <Link href={`/chart/${encodeURIComponent(r.symbol)}?tf=15m`} className="leader-row">
                  <span className="mono dim">{i + 1}</span>
                  <span className="leader-sym"><b>{r.symbol}</b><small className="dim">{r.zone ? `OB ${f2(r.zone.bottom)}–${f2(r.zone.top)}` : '—'}</small></span>
                  <span className="leader-px"><span className="mono">{f2(q?.ltp ?? r.ltp)}</span>{chg(q?.changePct ?? r.changePct)}</span>
                  <span className="leader-score"><span className="bar"><span style={{ width: `${r.score}%`, background: side === 'bull' ? 'linear-gradient(90deg,#34d399,#38bdf8)' : 'linear-gradient(90deg,#f87171,#fb923c)' }} /></span><span className="mono">{r.score}</span></span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Live top-5 bullish & bearish (same ranking as the Liquidity Board). */
export function LiveLeaders() {
  const { data } = useScan('15m');
  const { bulls, bears } = useMemo(() => {
    const rows = (data?.rows ?? []).filter(x => !x.choppy && x.zone && !x.ctx.flags.ban);
    const pick = (b: 'bullish' | 'bearish') => rows.filter(x => x.bias === b).sort((a, c) => c.rank - a.rank).slice(0, 5);
    return { bulls: pick('bullish'), bears: pick('bearish') };
  }, [data]);
  const live = useLiveQuotes([...bulls, ...bears].map(r => r.symbol));
  if (!data) return <div className="grid2"><div className="skeleton" style={{ height: 330 }} /><div className="skeleton" style={{ height: 330 }} /></div>;
  return <div className="grid2"><LeaderList rows={bulls} side="bull" live={live} /><LeaderList rows={bears} side="bear" live={live} /></div>;
}
