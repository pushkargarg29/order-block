'use client';
import type { Context, RegimeInfo, Bias, ScanResult } from '@/lib/types';
import { f2, pct } from './fmt';

const trendLabel = (t: number) => (t > 0.2 ? 'Up' : t < -0.2 ? 'Down' : 'Flat');
const trendCls = (t: number) => (t > 0.2 ? 'bull' : t < -0.2 ? 'bear' : 'muted');
const biasCls = (b: Bias) => (b === 'bullish' ? 'bullp' : b === 'bearish' ? 'bearp' : 'neutp');

export function EnrichmentCoverage({ enrichment }: { enrichment?: ScanResult['enrichment'] }) {
  if (!enrichment) return null;
  const { oi, options } = enrichment;
  return (
    <span className="dim" title="Available data / eligible candidates enriched during this scan">
      Context data: OI {oi.available}/{oi.requested} · options {options.available}/{options.requested}
    </span>
  );
}

export function ModelBadge({ fitted, trainedAt }: { fitted: boolean; trainedAt: string | null }) {
  return fitted
    ? <span className="pill bullp" title={`Model weights fitted on ${trainedAt ?? 'historical data'}; probability calibration is not guaranteed`}>Model fitted</span>
    : <span className="pill neutp" title="Scores use prior weights; probability calibration is not established">Prior model · not fitted</span>;
}

export function RegimeBar({ r }: { r: RegimeInfo | null }) {
  if (!r) return null;
  const vixCls = r.vix.level === 'high' ? 'bear' : r.vix.level === 'elevated' ? 'gold' : 'bull';
  return (
    <div className="card regime">
      <div><small>NIFTY 50</small><b className="mono">{f2(r.nifty.ltp)}</b> <span className={`mono ${(r.nifty.chgPct ?? 0) >= 0 ? 'bull' : 'bear'}`}>{pct(r.nifty.chgPct)}</span>
        <em className={trendCls(r.nifty.tfTrend)}>Timeframe {trendLabel(r.nifty.tfTrend)}</em><em className={trendCls(r.nifty.dayTrend)}>Daily {trendLabel(r.nifty.dayTrend)}</em></div>
      <div><small>BANK NIFTY</small><b className="mono">{f2(r.bank.ltp)}</b> <span className={`mono ${(r.bank.chgPct ?? 0) >= 0 ? 'bull' : 'bear'}`}>{pct(r.bank.chgPct)}</span>
        <em className={trendCls(r.bank.tfTrend)}>Timeframe {trendLabel(r.bank.tfTrend)}</em><em className={trendCls(r.bank.dayTrend)}>Daily {trendLabel(r.bank.dayTrend)}</em></div>
      <div><small>INDIA VIX</small><b className={`mono ${vixCls}`}>{f2(r.vix.ltp)}</b> <span className="mono dim">{pct(r.vix.chgPct)}</span><em className={vixCls}>{r.vix.level}</em></div>
      <div><small>F&amp;O BAN</small><b>{r.ban == null ? '—' : r.ban.length}</b><em className="dim" title={r.ban?.join(', ')}>{r.ban == null ? 'unavailable' : r.ban.slice(0, 3).join(', ') || 'none'}</em></div>
      <div><small>Results (10 days)</small><b>{r.earnings == null ? '—' : Object.keys(r.earnings).length}</b><em className="dim">{r.earnings == null ? 'calendar unavailable' : 'stocks flagged'}</em></div>
    </div>
  );
}

/** Compact chips for board tiles / table rows */
export function CtxChips({ c, max = 4 }: { c: Context; max?: number }) {
  const chips: { t: string; cls: string; title?: string }[] = [];
  if (c.flags.ban) chips.push({ t: 'F&O BAN', cls: 'bearp', title: 'Under an F&O ban; new derivative positions are not permitted' });
  if (c.flags.earnings) chips.push({ t: `Results ${c.flags.earnings.slice(5)}`, cls: 'goldp' });
  if (c.oi && c.oi.buildup !== 'Neutral') chips.push({ t: c.oi.buildup, cls: c.oi.signal > 0 ? 'bullp' : 'bearp', title: `Futures open-interest change: ${pct(c.oi.oiChgPct)}` });
  if (c.htf) for (const f of c.htf.frames) chips.push({ t: `${f.tf.toUpperCase()} ${f.label === 'neutral' ? '–' : f.label === 'bullish' ? '↑' : '↓'}`, cls: biasCls(f.label) });
  if (c.regime?.against) chips.push({ t: `Against ${c.regime.ref}`, cls: 'bearp', title: 'Signal conflicts with the reference index trend' });
  return <span className="chips">{chips.slice(0, max).map(x => <span key={x.t} className={`chip ${x.cls}`} title={x.title}>{x.t}</span>)}</span>;
}

export function ScoreBreakdown({ p, score, ctx, fitted }: { p: number | null; score: number; ctx: Context | null; fitted: boolean }) {
  if (p == null) return <p className="muted">No active order block aligns with the current trend, so no score is available.</p>;
  return (
    <div className="breakdown">
      <p className="score-note">The model output is adjusted by context factors to produce the final score. {fitted ? 'Probability calibration is not guaranteed.' : 'Prior weights are not calibrated probabilities.'}</p>
      <div><span>{fitted ? 'Estimated +1R outcome probability' : 'Prior-model output (not a probability)'}</span><b className="mono">{fitted ? `${(p * 100).toFixed(1)}%` : `${(p * 100).toFixed(1)}/100`}</b></div>
      {ctx?.adjustments.map(a => <div key={a.key + a.label}><span>{a.label}</span><b className={`mono ${a.delta >= 0 ? 'bull' : 'bear'}`}>{a.delta >= 0 ? '+' : ''}{a.delta.toFixed(2)} log-odds</b></div>)}
      <div className="total"><span>Final score</span><b className="mono grad">{score}</b></div>
    </div>
  );
}

export function ScoreDetails({ pModel, score, rank, fitted, ctx }: {
  pModel: number | null; score: number; rank: number; fitted: boolean; ctx: Context;
}) {
  return (
    <details className="score-details">
      <summary>Why this score?</summary>
      {pModel == null ? (
        <p>No active order block is available. The score falls back to directional bias, and context adjustments are not applied.</p>
      ) : (
        <>
          <p>{fitted
            ? <>Fitted model estimate: <b>{(pModel * 100).toFixed(1)}%</b> for reaching +1R before the stop loss. Probability calibration is not guaranteed.</>
            : <>Prior-model output: <b>{(pModel * 100).toFixed(1)}/100</b>. This is not a calibrated probability.</>}</p>
          <p>Context adjustments (log-odds):</p>
          {ctx.adjustments.length ? (
            <ul>{ctx.adjustments.map(a => <li key={a.key + a.label}>{a.label}: <b className={a.delta >= 0 ? 'bull' : 'bear'}>{a.delta >= 0 ? '+' : ''}{a.delta.toFixed(2)}</b></li>)}</ul>
          ) : <p>No context adjustments were applied.</p>}
        </>
      )}
      <p>Final score: <b>{score}/100</b>. Rank: <b>{rank}</b>. Ranking also accounts for proximity to the active order block.</p>
    </details>
  );
}

export function OiPanel({ c }: { c: Context | null }) {
  const oi = c?.oi;
  if (!oi) return <p className="muted">Futures open-interest data is unavailable before market open or when no data is available for this contract.</p>;
  return (
    <div className="kv">
      <div><small>Build-up</small><b className={oi.signal > 0 ? 'bull' : oi.signal < 0 ? 'bear' : ''}>{oi.buildup}</b></div>
      <div><small>Futures price change</small><b>{pct(oi.priceChgPct)}</b></div>
      <div><small>Open-interest change</small><b>{pct(oi.oiChgPct)}</b></div>
      <div><small>Open interest</small><b>{oi.oi.toLocaleString('en-IN')}</b></div>
    </div>
  );
}

export function HtfPanel({ c }: { c: Context | null }) {
  const h = c?.htf;
  if (!h) return <p className="muted">Higher-timeframe data is currently unavailable.</p>;
  return (
    <div className="kv">
      {h.frames.map(f => <div key={f.tf}><small>{f.tf.toUpperCase()} trend</small><b className={trendCls(f.trend)}>{f.label} ({f.trend.toFixed(2)})</b></div>)}
      <div><small>Alignment</small><b className={trendCls(h.align)}>{h.align.toFixed(2)}</b></div>
      <div><small>Order-block confluence</small><b className={h.confluence ? 'bull' : 'muted'}>{h.confluence ? 'Yes' : 'No'}</b></div>
    </div>
  );
}

export function RegimePanel({ c }: { c: Context | null }) {
  const r = c?.regime;
  if (!r) return <p className="muted">Index-regime data is currently unavailable.</p>;
  return (
    <div className="kv">
      <div><small>Reference index</small><b>{r.ref}</b></div>
      <div><small>Correlation / beta</small><b>{r.corr.toFixed(2)} / {r.beta.toFixed(2)}</b></div>
      <div><small>Index trend</small><b className={trendCls(r.refTrend)}>{r.refTrend.toFixed(2)}</b></div>
      <div><small>Signal vs. index</small><b className={r.against ? 'bear' : 'bull'}>{r.against ? 'Conflicts' : 'No conflict'}</b></div>
      <div><small>India VIX adjustment</small><b className={r.vixPenalty ? 'bear' : 'bull'}>{r.vixPenalty ? 'Risk adjustment applied' : 'No risk adjustment'}</b></div>
      <div><small>Market flags</small><b>{c?.flags.ban ? 'F&O ban' : c?.flags.earnings ? `Results ${c.flags.earnings}` : 'None'}</b></div>
    </div>
  );
}

export function WallsPanel({ c }: { c: Context | null }) {
  const w = c?.walls;
  if (!w) return <p className="muted">Options-chain data is unavailable.</p>;
  return (
    <>
      <div className="kv">
        <div><small>Call wall (resistance)</small><b className="bear">{f2(w.callWall)}</b></div>
        <div><small>Put wall (support)</small><b className="bull">{f2(w.putWall)}</b></div>
        <div><small>Put-call ratio</small><b>{w.pcr == null ? '—' : w.pcr.toFixed(2)}</b></div>
        <div><small>Maximum pain level</small><b>{f2(w.maxPain)}</b></div>
        <div><small>At-the-money implied volatility</small><b>{w.atmIv == null ? '—' : w.atmIv.toFixed(1) + '%'}</b></div>
        <div><small>Expiry</small><b>{w.expiry}</b></div>
      </div>
      <table className="tbl" style={{ marginTop: 12 }}><thead><tr><th>Highest call open interest</th><th>Change</th><th>Highest put open interest</th><th>Change</th></tr></thead>
        <tbody>{[0, 1, 2].map(i => <tr key={i}>
          <td className="mono">{w.topCalls[i] ? `${w.topCalls[i].strike} · ${w.topCalls[i].oi.toLocaleString('en-IN')}` : '—'}</td>
          <td className={`mono ${(w.topCalls[i]?.chgOi ?? 0) >= 0 ? 'bull' : 'bear'}`}>{w.topCalls[i]?.chgOi.toLocaleString('en-IN') ?? ''}</td>
          <td className="mono">{w.topPuts[i] ? `${w.topPuts[i].strike} · ${w.topPuts[i].oi.toLocaleString('en-IN')}` : '—'}</td>
          <td className={`mono ${(w.topPuts[i]?.chgOi ?? 0) >= 0 ? 'bull' : 'bear'}`}>{w.topPuts[i]?.chgOi.toLocaleString('en-IN') ?? ''}</td>
        </tr>)}</tbody></table>
    </>
  );
}
