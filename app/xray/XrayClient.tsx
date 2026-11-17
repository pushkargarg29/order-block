'use client';
import Link from 'next/link';
import type { ScanResult } from '@/lib/types';
import { useMemo, useState } from 'react';
import type { ScanRow, Timeframe } from '@/lib/types';
import { useScan } from '@/components/useScan';
import TfSwitch from '@/components/TfSwitch';
import LiveBadge from '@/components/LiveBadge';
import { f2, pct } from '@/components/fmt';
import { RegimeBar, ModelBadge, ScoreDetails } from '@/components/Context';
import MarketUniverse3D from '@/components/three/MarketUniverse3D';

type Key = 'symbol' | 'ltp' | 'changePct' | 'score' | 'rank' | 'er' | 'rsi' | 'rvol' | 'atrPct' | 'dist' | 'rr' | 'oi' | 'htf' | 'pcr';
const val = (r: ScanRow, k: Key): number | string => {
  switch (k) { case 'oi': return r.ctx.oi?.oiChgPct ?? -999; case 'htf': return r.ctx.htf?.align ?? -9; case 'pcr': return r.ctx.walls?.pcr ?? -1; case 'symbol': return r.symbol; case 'dist': return r.zone?.distATR ?? 99; case 'rr': return r.plan?.rr ?? -1; case 'changePct': return r.changePct ?? 0; default: return r[k] as number; }
};

export default function XrayClient({ initial = null }: { initial?: ScanResult | null }) {
  const [tf, setTf] = useState<Timeframe>('15m');
  const { data, error, loading } = useScan(tf, initial);
  const [q, setQ] = useState('');
  const [bias, setBias] = useState<'all' | 'bullish' | 'bearish' | 'neutral'>('all');
  const [inZone, setInZone] = useState(false);
  const [oiOk, setOiOk] = useState(false);
  const [htfOk, setHtfOk] = useState(false);
  const [hideBan, setHideBan] = useState(true);
  const [sort, setSort] = useState<{ k: Key; d: 1 | -1 }>({ k: 'rank', d: -1 });

  const rows = useMemo(() => {
    let r = data?.rows ?? [];
    if (q) r = r.filter(x => x.symbol.includes(q) || x.name.toUpperCase().includes(q));
    if (bias !== 'all') r = r.filter(x => x.bias === bias);
    if (inZone) r = r.filter(x => x.zone && x.zone.distATR <= 0.5);
    if (oiOk) r = r.filter(x => x.ctx.oi && x.ctx.oi.signal * (x.bias === 'bullish' ? 1 : x.bias === 'bearish' ? -1 : 0) > 0);
    if (htfOk) r = r.filter(x => (x.ctx.htf?.align ?? 0) > 0.2);
    if (hideBan) r = r.filter(x => !x.ctx.flags.ban);
    return [...r].sort((a, b) => { const A = val(a, sort.k), B = val(b, sort.k); return (A > B ? 1 : A < B ? -1 : 0) * sort.d; });
  }, [data, q, bias, inZone, oiOk, htfOk, hideBan, sort]);

  const th = (k: Key, label: string) => <th onClick={() => setSort(s => ({ k, d: s.k === k ? (s.d === 1 ? -1 : 1) : -1 }))}>{label}{sort.k === k ? (sort.d === -1 ? ' ↓' : ' ↑') : ''}</th>;

  const exportCsv = () => {
    const head = ['Symbol', 'LTP', 'Change%', 'Bias', 'Score', 'ModelP', 'OI buildup', 'OI chg%', 'HTF align', 'Ref index', 'Call wall', 'Put wall', 'PCR', 'Ban', 'Results', 'OB Bottom', 'OB Top', 'Dist ATR', 'Support', 'Resistance', 'Liquidity', 'Entry', 'SL', 'TP1', 'TP2', 'TP3', 'TP1 R', 'ER', 'RSI', 'RVOL'];
    const lines = rows.map(r => [r.symbol, r.ltp, r.changePct?.toFixed(2), r.bias, r.score, r.pModel?.toFixed(3), r.ctx.oi?.buildup, r.ctx.oi?.oiChgPct.toFixed(2), r.ctx.htf?.align.toFixed(2), r.ctx.regime?.ref, r.ctx.walls?.callWall, r.ctx.walls?.putWall, r.ctx.walls?.pcr?.toFixed(2), r.ctx.flags.ban ? 'Y' : '', r.ctx.flags.earnings ?? '', r.zone?.bottom, r.zone?.top, r.zone?.distATR.toFixed(2), r.support, r.resistance, r.liquidity, r.plan?.entry.toFixed(2), r.plan?.sl.toFixed(2), r.plan?.tps[0].price.toFixed(2), r.plan?.tps[1].price.toFixed(2), r.plan?.tps[2].price.toFixed(2), r.plan?.rr.toFixed(2), r.er.toFixed(2), r.rsi.toFixed(1), r.rvol.toFixed(2)].map(v => v ?? '').join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `stoclio-xray-${tf}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="container">
      <div className="page-head">
        <div><h1><span className="grad">Market X-Ray</span></h1><p className="muted" style={{ marginTop: 6 }}>Every active F&amp;O stock with structure, open-interest and options data in one sortable view.</p></div>
        <div className="toolbar">{data && <ModelBadge calibrated={data.model.calibrated} trainedAt={data.model.trainedAt} />}<LiveBadge at={data?.quoteAt === undefined ? data?.at : data.quoteAt} coverage={data?.quoteCoverage} sampleLabel="Quotes sampled" /><TfSwitch value={tf} onChange={setTf} /></div>
      </div>
      <RegimeBar r={data?.regime ?? null} />
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <input className="input" placeholder="Search symbol or name…" value={q} onChange={e => setQ(e.target.value.toUpperCase().slice(0, 30))} aria-label="Search" />
        <div className="seg">{(['all', 'bullish', 'bearish', 'neutral'] as const).map(b => <button key={b} className={bias === b ? 'on' : ''} onClick={() => setBias(b)}>{b === 'neutral' ? 'Range-bound' : b[0].toUpperCase() + b.slice(1)}</button>)}</div>
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={inZone} onChange={e => setInZone(e.target.checked)} />At / near order block (≤0.5 ATR)</label>
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={oiOk} onChange={e => setOiOk(e.target.checked)} />OI confirms</label>
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={htfOk} onChange={e => setHtfOk(e.target.checked)} />HTF aligned</label>
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={hideBan} onChange={e => setHideBan(e.target.checked)} />Exclude F&amp;O ban</label>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
      </div>
      {error && <div className="notice err" style={{ marginBottom: 16 }}>⚠ {error}{data ? ' Showing the last available scan.' : ''}</div>}
      <div className="card tbl-wrap xray-table">
        {loading && !data ? <div className="skeleton" style={{ height: 420 }} /> : (
          <table className="tbl">
            <thead><tr>
              {th('symbol', 'Symbol')}{th('ltp', 'LTP')}{th('changePct', 'Chg %')}<th>Bias</th>{th('score', 'Score')}{th('rank', 'Rank')}{th('oi', 'OI build-up')}{th('htf', 'HTF')}<th>Index</th><th>OI walls (C / P)</th>{th('pcr', 'PCR')}<th>Flags</th><th>Order block</th>{th('dist', 'Dist (ATR)')}
              <th>Support</th><th>Resistance</th><th>Liquidity</th><th>Entry / SL / TP1 · TP2 · TP3</th>{th('rr', 'R:R')}{th('er', 'Effic.')}{th('rsi', 'RSI')}{th('rvol', 'RVOL')}{th('atrPct', 'ATR %')}<th>Last event</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.symbol}>
                  <td><Link href={`/chart/${encodeURIComponent(r.symbol)}?tf=${tf}`} style={{ fontWeight: 700, color: 'var(--blue2)' }}>{r.symbol}</Link></td>
                  <td className="mono">{f2(r.ltp)}</td>
                  <td className={`mono ${(r.changePct ?? 0) >= 0 ? 'bull' : 'bear'}`}>{pct(r.changePct)}</td>
                  <td><span className={`pill ${r.bias === 'bullish' ? 'bullp' : r.bias === 'bearish' ? 'bearp' : 'neutp'}`} style={{ padding: '2px 9px', fontSize: 12 }}>{r.bias === 'neutral' ? 'Range-bound' : r.bias}</span></td>
                  <td className="mono"><b>{r.score}</b></td>
                  <td className="mono dim">{r.rank}</td>
                  <td className={r.ctx.oi ? (r.ctx.oi.signal > 0 ? 'bull' : r.ctx.oi.signal < 0 ? 'bear' : 'dim') : 'dim'}>{r.ctx.oi ? `${r.ctx.oi.buildup} (${pct(r.ctx.oi.oiChgPct)})` : '—'}</td>
                  <td className={`mono ${(r.ctx.htf?.align ?? 0) > 0.2 ? 'bull' : (r.ctx.htf?.align ?? 0) < -0.2 ? 'bear' : 'dim'}`}>{r.ctx.htf ? r.ctx.htf.align.toFixed(2) : '—'}</td>
                  <td className={r.ctx.regime?.against ? 'bear' : 'dim'}>{r.ctx.regime ? `${r.ctx.regime.ref}${r.ctx.regime.against ? ' ✕' : ''}` : '—'}</td>
                  <td className="mono">{r.ctx.walls ? `${f2(r.ctx.walls.callWall)} / ${f2(r.ctx.walls.putWall)}` : '—'}</td>
                  <td className="mono">{r.ctx.walls?.pcr != null ? r.ctx.walls.pcr.toFixed(2) : '—'}</td>
                  <td>{r.ctx.flags.ban ? <span className="chip bearp">BAN</span> : null}{r.ctx.flags.earnings ? <span className="chip goldp">Results {r.ctx.flags.earnings.slice(5)}</span> : null}</td>
                  <td className="mono">{r.zone ? `${f2(r.zone.bottom)}–${f2(r.zone.top)}` : '—'}</td>
                  <td className="mono">{r.zone ? r.zone.distATR.toFixed(2) : '—'}</td>
                  <td className="mono">{f2(r.support)}</td><td className="mono">{f2(r.resistance)}</td><td className="mono gold">{f2(r.liquidity)}</td>
                  <td className="mono dim">{r.plan ? `${f2(r.plan.entry)} / ${f2(r.plan.sl)} / ${r.plan.tps.map(t => f2(t.price)).join(' · ')}` : '—'}</td>
                  <td className="mono">{r.plan ? r.plan.rr.toFixed(2) : '—'}</td>
                  <td className="mono">{r.er.toFixed(2)}</td><td className="mono">{r.rsi.toFixed(1)}</td><td className="mono">{r.rvol.toFixed(2)}</td><td className="mono">{r.atrPct.toFixed(2)}</td>
                  <td className={r.lastEvent ? (r.lastEvent.dir === 'bull' ? 'bull' : 'bear') : 'dim'}>{r.lastEvent ? `${r.lastEvent.kind} ${r.lastEvent.dir === 'bull' ? '↑' : '↓'}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mobile-data-list xray-mobile">
        {loading && !data ? <div className="skeleton" style={{ height: 220 }} />
          : rows.length ? rows.map(r => (
            <article className="card mobile-xray-card" key={r.symbol}>
              <div className="mobile-xray-head">
                <Link href={`/chart/${encodeURIComponent(r.symbol)}?tf=${tf}`} className="sym-link">{r.symbol}</Link>
                <span className="mono mobile-xray-price">{f2(r.ltp)}</span>
                <span className={`mono ${(r.changePct ?? 0) >= 0 ? 'bull' : 'bear'}`}>{pct(r.changePct)}</span>
              </div>
              <div className="mobile-xray-summary">
                <span className={`pill ${r.bias === 'bullish' ? 'bullp' : r.bias === 'bearish' ? 'bearp' : 'neutp'} pill-sm`}>{r.bias === 'neutral' ? 'Range-bound' : r.bias}</span>
                <b className="mono">Score {r.score}</b>
                <span className="dim">{r.zone ? `OB ${f2(r.zone.bottom)}–${f2(r.zone.top)}` : 'No active OB'}</span>
              </div>
              <details className="mobile-details">
                <summary>Full metrics &amp; score explanation</summary>
                <div className="mobile-metrics">
                  <div><small>Rank</small><b>{r.rank}</b></div>
                  <div><small>OI build-up</small><b>{r.ctx.oi?.buildup ?? 'Unavailable'}</b></div>
                  <div><small>HTF alignment</small><b>{r.ctx.htf?.align.toFixed(2) ?? 'Unavailable'}</b></div>
                  <div><small>Reference index</small><b>{r.ctx.regime?.ref ?? 'Unavailable'}</b></div>
                  <div><small>OI walls (C / P)</small><b className="mono">{r.ctx.walls ? `${f2(r.ctx.walls.callWall)} / ${f2(r.ctx.walls.putWall)}` : 'Unavailable'}</b></div>
                  <div><small>PCR</small><b>{r.ctx.walls?.pcr?.toFixed(2) ?? '—'}</b></div>
                  <div><small>OB distance</small><b>{r.zone ? `${r.zone.distATR.toFixed(2)} ATR` : '—'}</b></div>
                  <div><small>Support / resistance</small><b className="mono">{f2(r.support)} / {f2(r.resistance)}</b></div>
                  <div><small>Liquidity</small><b className="mono">{f2(r.liquidity)}</b></div>
                  <div><small>Entry / stop</small><b className="mono">{r.plan ? `${f2(r.plan.entry)} / ${f2(r.plan.sl)}` : '—'}</b></div>
                  <div><small>Targets</small><b className="mono">{r.plan ? r.plan.tps.map(t => f2(t.price)).join(' / ') : '—'}</b></div>
                  <div><small>R:R</small><b>{r.plan?.rr.toFixed(2) ?? '—'}</b></div>
                  <div><small>Efficiency / RSI</small><b>{r.er.toFixed(2)} / {r.rsi.toFixed(1)}</b></div>
                  <div><small>RVOL / ATR</small><b>{r.rvol.toFixed(2)}× / {r.atrPct.toFixed(2)}%</b></div>
                  <div><small>Flags</small><b>{r.ctx.flags.ban ? 'F&O ban' : r.ctx.flags.earnings ? `Results ${r.ctx.flags.earnings}` : 'None'}</b></div>
                  <div><small>Last event</small><b>{r.lastEvent ? `${r.lastEvent.kind} ${r.lastEvent.dir === 'bull' ? '↑' : '↓'}` : '—'}</b></div>
                </div>
                <ScoreDetails pModel={r.pModel} score={r.score} rank={r.rank} calibrated={!!data?.model.calibrated} ctx={r.ctx} />
              </details>
            </article>
          )) : <p className="muted">No stocks match these filters.</p>}
      </div>
      {data && data.rows.length > 0 && <div className="card glass" style={{ padding: 14, marginTop: 16 }}><MarketUniverse3D rows={rows} tf={tf} height={440} /></div>}
      <p className="dim" style={{ fontSize: 13, marginTop: 12 }}>{rows.length} of {data?.scanned ?? 0} stocks shown · OI computed for the top 60 candidates and option walls for the top 25 per scan{data?.failed ? ` · ${data.failed} skipped (insufficient data)` : ''}.</p>
    </div>
  );
}
