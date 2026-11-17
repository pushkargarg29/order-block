'use client';
import Link from 'next/link';
import type { ScanResult } from '@/lib/types';
import { useMemo, useState } from 'react';
import type { ScanRow, Timeframe } from '@/lib/types';
import { useScan, useLiveQuotes } from '@/components/useScan';
import TfSwitch from '@/components/TfSwitch';
import LiveBadge from '@/components/LiveBadge';
import { ModelBadge, RegimeBar } from '@/components/Context';
import { f2, pct } from '@/components/fmt';

type Sort = 'rank' | 'score' | 'dist' | 'rr' | 'risk' | 'symbol';
const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };

export default function PlansClient({ initial = null }: { initial?: ScanResult | null }) {
  const [tf, setTf] = useState<Timeframe>('15m');
  const { data, error, loading } = useScan(tf, initial);
  const [side, setSide] = useState<'all' | 'bull' | 'bear'>('all');
  const [atEntry, setAtEntry] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [hideBan, setHideBan] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('rank');

  const plans = useMemo(() => {
    let r = (data?.rows ?? []).filter((x): x is ScanRow & { plan: NonNullable<ScanRow['plan']> } => !!x.plan && !x.choppy);
    if (side !== 'all') r = r.filter(x => x.plan.side === side);
    if (atEntry) r = r.filter(x => x.plan.trigger === 'at-entry');
    if (minScore) r = r.filter(x => x.score >= minScore);
    if (hideBan) r = r.filter(x => !x.ctx.flags.ban);
    if (q) r = r.filter(x => x.symbol.includes(q) || x.name.toUpperCase().includes(q));
    const key = (x: (typeof r)[number]) => sort === 'rank' ? -x.rank : sort === 'score' ? -x.score : sort === 'dist' ? x.plan.distPct : sort === 'rr' ? -x.plan.tps[1].r : sort === 'risk' ? x.plan.riskPct : 0;
    return sort === 'symbol' ? [...r].sort((a, b) => a.symbol.localeCompare(b.symbol)) : [...r].sort((a, b) => key(a) - key(b));
  }, [data, side, atEntry, minScore, hideBan, q, sort]);

  const live = useLiveQuotes(plans.slice(0, 100).map(p => p.symbol));
  const totals = useMemo(() => {
    const all = (data?.rows ?? []).filter(x => x.plan && !x.choppy);
    return { all: all.length, long: all.filter(x => x.plan!.side === 'bull').length, short: all.filter(x => x.plan!.side === 'bear').length,
      atEntry: all.filter(x => x.plan!.trigger === 'at-entry').length, noPlan: (data?.scanned ?? 0) - all.length };
  }, [data]);

  const exportCsv = () => {
    const head = ['Symbol', 'Side', 'Score', 'LTP', 'Status', 'Entry', 'Stop loss', 'Risk %', 'TP1', 'TP1 R', 'TP2', 'TP2 R', 'TP3', 'TP3 R', 'Invalidation', 'Valid', 'Flags'];
    const lines = plans.map(r => { const p = r.plan; return [r.symbol, p.side === 'bull' ? 'LONG' : 'SHORT', r.score, live[r.symbol]?.ltp ?? r.ltp,
      p.trigger === 'at-entry' ? 'At entry' : `Wait ${p.distPct.toFixed(2)}%`, p.entry.toFixed(2), p.sl.toFixed(2), p.riskPct.toFixed(2),
      ...p.tps.flatMap(t => [t.price.toFixed(2), t.r.toFixed(2)]), p.invalidation.toFixed(2), p.validity,
      [r.ctx.flags.ban ? 'F&O ban' : '', r.ctx.flags.earnings ? `Results ${r.ctx.flags.earnings}` : ''].filter(Boolean).join('; ')].map(csvCell).join(','); });
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `stoclio-trade-plans-${tf}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const th = (k: Sort, label: string) => <th onClick={() => setSort(k)} aria-sort={sort === k ? 'descending' : 'none'}>{label}{sort === k ? ' ↓' : ''}</th>;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Trade <span className="grad">Plans</span></h1>
          <p className="muted" style={{ marginTop: 6 }}>Entry, stop loss and TP1–TP3 for every F&amp;O stock with a valid order-block setup — rebuilt on every scan.</p>
        </div>
        <div className="toolbar">{data && <ModelBadge calibrated={data.model.calibrated} trainedAt={data.model.trainedAt} />}<LiveBadge at={data?.at} /><TfSwitch value={tf} onChange={setTf} /></div>
      </div>
      <RegimeBar r={data?.regime ?? null} />

      <div className="stats plan-stats">
        <div className="card stat"><b className="grad">{data ? totals.all : '—'}</b><span className="muted">Valid plans</span></div>
        <div className="card stat"><b className="bull">{data ? totals.long : '—'}</b><span className="muted">Long</span></div>
        <div className="card stat"><b className="bear">{data ? totals.short : '—'}</b><span className="muted">Short</span></div>
        <div className="card stat"><b style={{ color: 'var(--sky)' }}>{data ? totals.atEntry : '—'}</b><span className="muted">At entry now</span></div>
      </div>

      <div className="toolbar" style={{ margin: '18px 0 14px' }}>
        <input className="input" placeholder="Search symbol…" value={q} maxLength={30} onChange={e => setQ(e.target.value.toUpperCase().replace(/[^A-Z0-9&\- ]/g, ''))} aria-label="Search symbol" />
        <div className="seg" role="tablist" aria-label="Side">{(['all', 'bull', 'bear'] as const).map(s => <button key={s} type="button" className={side === s ? 'on' : ''} onClick={() => setSide(s)}>{s === 'all' ? 'All' : s === 'bull' ? 'Long' : 'Short'}</button>)}</div>
        <div className="seg" role="tablist" aria-label="Minimum score">{[0, 50, 60, 70].map(m => <button key={m} type="button" className={minScore === m ? 'on' : ''} onClick={() => setMinScore(m)}>{m ? `Score ≥ ${m}` : 'Any score'}</button>)}</div>
        <label className="muted chk"><input type="checkbox" checked={atEntry} onChange={e => setAtEntry(e.target.checked)} />At entry now</label>
        <label className="muted chk"><input type="checkbox" checked={hideBan} onChange={e => setHideBan(e.target.checked)} />Exclude F&amp;O ban</label>
        <span className="spacer" />
        <button type="button" className="btn" onClick={exportCsv} disabled={!plans.length}>Export CSV</button>
      </div>

      {error && !data && <div className="notice err" style={{ marginBottom: 16 }}>⚠ {error}</div>}

      <div className="card tbl-wrap">
        {loading && !data ? <div className="skeleton" style={{ height: 420 }} /> : (
          <table className="tbl plans-tbl">
            <thead><tr>
              {th('symbol', 'Symbol')}<th>Side</th>{th('score', 'Score')}<th>LTP</th>{th('dist', 'Status')}<th>Entry</th>{th('risk', 'Stop loss')}
              <th>TP1</th>{th('rr', 'TP2')}<th>TP3</th><th>Invalidation</th><th>Flags</th>
            </tr></thead>
            <tbody>
              {plans.map(r => {
                const p = r.plan, l = live[r.symbol], ltp = l?.ltp ?? r.ltp, bull = p.side === 'bull';
                const stopped = bull ? ltp <= p.sl : ltp >= p.sl;
                return (
                  <tr key={r.symbol}>
                    <td><Link href={`/chart/${encodeURIComponent(r.symbol)}?tf=${tf}`} className="sym-link">{r.symbol}</Link></td>
                    <td><span className={`pill ${bull ? 'bullp' : 'bearp'} pill-sm`}>{bull ? 'LONG' : 'SHORT'}</span></td>
                    <td className="mono"><b>{r.score}</b></td>
                    <td className="mono">{f2(ltp)} <span className={(l?.changePct ?? r.changePct ?? 0) >= 0 ? 'bull' : 'bear'}>{pct(l?.changePct ?? r.changePct)}</span></td>
                    <td>{stopped ? <span className="bear">{bull ? 'Below' : 'Above'} stop — skip</span> : p.trigger === 'at-entry' ? <span style={{ color: 'var(--sky)', fontWeight: 700 }}>● At entry</span> : <span className="dim">Wait · {p.distPct.toFixed(2)}% away</span>}</td>
                    <td className="mono grad" style={{ fontWeight: 700 }}>{f2(p.entry)}</td>
                    <td className="mono bear">{f2(p.sl)} <small className="dim">({p.riskPct.toFixed(2)}%)</small></td>
                    {p.tps.map((t, i) => <td key={i} className="mono bull" title={t.source}>{f2(t.price)} <small className="dim">{t.r.toFixed(1)}R</small></td>)}
                    <td className="mono dim">{f2(p.invalidation)}</td>
                    <td>{r.ctx.flags.ban && <span className="chip bearp">BAN</span>}{r.ctx.flags.earnings && <span className="chip goldp">Results {r.ctx.flags.earnings.slice(5)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {data && !plans.length && <p className="muted" style={{ padding: 20 }}>No plans match these filters.</p>}
      </div>

      <div className="card glass" style={{ padding: 'clamp(16px,3vw,24px)', marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>How every plan is built and managed</h3>
        <div className="grid2 rules">
          <ul>
            <li><b>Entry</b> — limit at the order-block edge; market if price is already inside the block.</li>
            <li><b>Stop loss</b> — beyond the far edge of the block ± 0.2 ATR.</li>
            <li><b>TP1 / TP2 / TP3</b> — at least 1R / 2R / 3R, snapped to the nearest liquidity pool, swing level or option OI wall within +1.25R of each multiple.</li>
            <li><b>Valid</b> — intraday entries expire at 15:15 IST; daily entries after 3 sessions.</li>
          </ul>
          <ul>
            <li>Book <b>50% at TP1</b> and move the stop to entry.</li>
            <li>Book <b>30% at TP2</b> and trail the stop to TP1.</li>
            <li>Exit the final <b>20% at TP3</b>.</li>
            <li>Exit early if a candle <b>closes beyond the invalidation</b> level; skip if price gaps past the stop.</li>
          </ul>
        </div>
        <p className="dim" style={{ fontSize: 13, marginTop: 12 }}>
          {totals.noPlan > 0 && `${totals.noPlan} stocks have no plan right now (choppy, no active order block, or stop too wide). `}
          Plans are algorithmic, not recommendations. No method is always right — size each trade so a stop-out is affordable.
          Backtested TP1/TP2/TP3 hit rates are on each chart&apos;s backtest panel.
        </p>
      </div>
    </div>
  );
}
