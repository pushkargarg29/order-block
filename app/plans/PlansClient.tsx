'use client';
import Link from 'next/link';
import type { ScanResult } from '@/lib/types';
import { useMemo, useState } from 'react';
import type { ScanRow, Timeframe } from '@/lib/types';
import { useScan, useLiveQuotes } from '@/components/useScan';
import TfSwitch from '@/components/TfSwitch';
import LiveBadge from '@/components/LiveBadge';
import { ModelBadge, RegimeBar, ScoreDetails, EnrichmentCoverage } from '@/components/Context';
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
    const head = ['Symbol', 'Direction', 'Score', 'Last traded price', 'Entry status', 'Entry price', 'Stop-loss price', 'Risk %', 'Take-profit 1', 'TP1 risk multiple', 'Take-profit 2', 'TP2 risk multiple', 'Take-profit 3', 'TP3 risk multiple', 'Invalidation price', 'Plan validity', 'Market flags'];
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
          <p className="muted" style={{ marginTop: 6 }}>Entry, stop loss and TP1–TP3 levels for every active NSE F&amp;O stock with a valid order-block setup, recalculated with each scan.</p>
        </div>
        <div className="toolbar">{data && <ModelBadge fitted={data.model.fitted} trainedAt={data.model.trainedAt} />}<EnrichmentCoverage enrichment={data?.enrichment} /><LiveBadge at={data?.quoteAt === undefined ? data?.at : data.quoteAt} coverage={data?.quoteCoverage} scanCoverage={data?.scanCoverage} sampleLabel="Quotes sampled" /><TfSwitch value={tf} onChange={setTf} /></div>
      </div>
      <RegimeBar r={data?.regime ?? null} />

      <div className="stats plan-stats">
        <div className="card stat"><b className="grad">{data ? totals.all : '—'}</b><span className="muted">Valid plans</span></div>
        <div className="card stat"><b className="bull">{data ? totals.long : '—'}</b><span className="muted">Long</span></div>
        <div className="card stat"><b className="bear">{data ? totals.short : '—'}</b><span className="muted">Short</span></div>
        <div className="card stat"><b style={{ color: 'var(--sky)' }}>{data ? totals.atEntry : '—'}</b><span className="muted">Entry triggered</span></div>
      </div>

      <div className="toolbar" style={{ margin: '18px 0 14px' }}>
        <input className="input" placeholder="Search symbol…" value={q} maxLength={30} onChange={e => setQ(e.target.value.toUpperCase().replace(/[^A-Z0-9&\- ]/g, ''))} aria-label="Search symbol" />
        <div className="seg" role="tablist" aria-label="Side">{(['all', 'bull', 'bear'] as const).map(s => <button key={s} type="button" className={side === s ? 'on' : ''} onClick={() => setSide(s)}>{s === 'all' ? 'All' : s === 'bull' ? 'Long' : 'Short'}</button>)}</div>
        <div className="seg" role="tablist" aria-label="Minimum score">{[0, 50, 60, 70].map(m => <button key={m} type="button" className={minScore === m ? 'on' : ''} onClick={() => setMinScore(m)}>{m ? `Score ≥ ${m}` : 'Any score'}</button>)}</div>
        <label className="muted chk"><input type="checkbox" checked={atEntry} onChange={e => setAtEntry(e.target.checked)} />Price at entry</label>
        <label className="muted chk"><input type="checkbox" checked={hideBan} onChange={e => setHideBan(e.target.checked)} />Exclude securities under F&amp;O ban</label>
        <span className="spacer" />
        <button type="button" className="btn" onClick={exportCsv} disabled={!plans.length}>Export CSV</button>
      </div>

      {error && <div className="notice err" style={{ marginBottom: 16 }}>⚠ {error}{data ? ' Showing the last available scan.' : ''}</div>}

      <div className="card tbl-wrap plans-table">
        {loading && !data ? <div className="skeleton" style={{ height: 420 }} /> : (
          <table className="tbl plans-tbl">
            <thead><tr>
              {th('symbol', 'Symbol')}<th>Direction</th>{th('score', 'Score')}<th>Last traded price</th>{th('dist', 'Entry status')}<th>Entry</th>{th('risk', 'Stop loss')}
              <th>Take profit 1</th>{th('rr', 'Take profit 2')}<th>Take profit 3</th><th>Invalidation level</th><th>Market flags</th>
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
                    <td>{stopped ? <span className="bear">Stop loss breached — do not enter</span> : p.trigger === 'at-entry' ? <span style={{ color: 'var(--sky)', fontWeight: 700 }}>● Entry triggered</span> : <span className="dim">Await entry · {p.distPct.toFixed(2)}% away</span>}</td>
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
        {data && !plans.length && <p className="muted" style={{ padding: 20 }}>No trade plans match the selected filters.</p>}
      </div>

      <div className="mobile-data-list plans-mobile">
        {loading && !data ? <div className="skeleton" style={{ height: 220 }} />
          : plans.length ? plans.map(r => {
            const p = r.plan, l = live[r.symbol], ltp = l?.ltp ?? r.ltp, bull = p.side === 'bull';
            const stopped = bull ? ltp <= p.sl : ltp >= p.sl;
            const status = stopped ? 'Stop loss breached — do not enter' : p.trigger === 'at-entry' ? 'Entry triggered' : `Await entry · ${p.distPct.toFixed(2)}% away`;
            return (
              <article className="card mobile-plan" key={r.symbol}>
                <div className="mobile-plan-head">
                  <Link href={`/chart/${encodeURIComponent(r.symbol)}?tf=${tf}`} className="sym-link">{r.symbol}</Link>
                  <span className={`pill ${bull ? 'bullp' : 'bearp'} pill-sm`}>{bull ? 'LONG' : 'SHORT'}</span>
                  <span className="mobile-score mono">Score {r.score}</span>
                </div>
                <div className="mobile-plan-quote">
                  <span><small>Last traded price</small><b className="mono">{f2(ltp)}</b> <span className={(l?.changePct ?? r.changePct ?? 0) >= 0 ? 'bull' : 'bear'}>{pct(l?.changePct ?? r.changePct)}</span></span>
                  <b className={stopped ? 'bear' : p.trigger === 'at-entry' ? 'bull' : 'muted'}>{status}</b>
                </div>
                <div className="mobile-plan-levels">
                  <div><small>Entry</small><b className="mono">{f2(p.entry)}</b></div>
                  <div><small>Stop loss</small><b className="mono bear">{f2(p.sl)}</b></div>
                  {p.tps.map((t, i) => <div key={i}><small>Take profit {i + 1} · {t.r.toFixed(1)}R</small><b className="mono bull">{f2(t.price)}</b><small>{t.source}</small></div>)}
                </div>
                <details className="mobile-details">
                  <summary>Trade-plan rules and score details</summary>
                  <div className="mobile-metrics">
                    <div><small>Risk</small><b>{p.riskPct.toFixed(2)}%</b></div>
                    <div><small>Invalidation</small><b className="mono">{f2(p.invalidation)}</b></div>
                    <div><small>Validity</small><b>{p.validity}</b></div>
                    <div><small>Market flags</small><b>{r.ctx.flags.ban ? 'F&O ban' : r.ctx.flags.earnings ? `Results ${r.ctx.flags.earnings}` : 'None'}</b></div>
                  </div>
                  <ul className="mobile-exit-rules">{p.exitRules.map(rule => <li key={rule}>{rule}</li>)}</ul>
                  <ScoreDetails pModel={r.pModel} score={r.score} rank={r.rank} fitted={!!data?.model.fitted} ctx={r.ctx} />
                </details>
              </article>
            );
          }) : <p className="muted">No trade plans match the selected filters.</p>}
      </div>

      <div className="card glass" style={{ padding: 'var(--card-padding)', marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>How every plan is built and managed</h3>
        <div className="grid2 rules">
          <ul>
            <li><b>Entry</b> — limit at the order-block edge; market if price is already inside the block.</li>
            <li><b>Stop loss</b> — placed 0.2 ATR beyond the far edge of the block.</li>
            <li><b>TP1 / TP2 / TP3</b> — set at a minimum of 1R / 2R / 3R, respectively, and aligned with a nearby liquidity pool, swing level or options open-interest wall when it falls within +1.25R of the target.</li>
            <li><b>Plan validity</b> — intraday entries expire at 15:15 IST; daily entries expire after three sessions.</li>
          </ul>
          <ul>
            <li>Take profit on <b>50% at TP1</b> and move the stop to entry.</li>
            <li>Take profit on <b>30% at TP2</b> and trail the stop to TP1.</li>
            <li>Exit the final <b>20% at TP3</b>.</li>
            <li>Exit early if a candle <b>closes beyond the invalidation level</b>; do not enter if the price gaps beyond the stop loss.</li>
          </ul>
        </div>
        <p className="dim" style={{ fontSize: 13, marginTop: 12 }}>
          {totals.noPlan > 0 && `${totals.noPlan} stocks currently have no plan because conditions are range-bound, no active order block is available, or the stop-loss distance is too wide. `}
          Plans are algorithmic and are not recommendations. No method is guaranteed to be accurate; size each trade so a stop-loss does not exceed your risk tolerance.
          Historical TP1, TP2 and TP3 attainment rates are available in each chart&apos;s backtest panel.
        </p>
      </div>
    </div>
  );
}
