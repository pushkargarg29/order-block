'use client';
import type { Context, RegimeInfo, Bias } from '@/lib/types';
import { f2, pct } from './fmt';

const trendLabel = (t: number) => (t > 0.2 ? 'Up' : t < -0.2 ? 'Down' : 'Flat');
const trendCls = (t: number) => (t > 0.2 ? 'bull' : t < -0.2 ? 'bear' : 'muted');
const biasCls = (b: Bias) => (b === 'bullish' ? 'bullp' : b === 'bearish' ? 'bearp' : 'neutp');

export function ModelBadge({ calibrated, trainedAt }: { calibrated: boolean; trainedAt: string | null }) {
  return calibrated
    ? <span className="pill bullp" title={`Fitted ${trainedAt ?? ''}`}>Model calibrated</span>
    : <span className="pill neutp" title="Scores use prior weights until the model is calibrated on historical data">Uncalibrated model</span>;
}

export function RegimeBar({ r }: { r: RegimeInfo | null }) {
  if (!r) return null;
  const vixCls = r.vix.level === 'high' ? 'bear' : r.vix.level === 'elevated' ? 'gold' : 'bull';
  return (
    <div className="card regime">
      <div><small>NIFTY 50</small><b className="mono">{f2(r.nifty.ltp)}</b> <span className={`mono ${(r.nifty.chgPct ?? 0) >= 0 ? 'bull' : 'bear'}`}>{pct(r.nifty.chgPct)}</span>
        <em className={trendCls(r.nifty.tfTrend)}>TF {trendLabel(r.nifty.tfTrend)}</em><em className={trendCls(r.nifty.dayTrend)}>D {trendLabel(r.nifty.dayTrend)}</em></div>
      <div><small>BANK NIFTY</small><b className="mono">{f2(r.bank.ltp)}</b> <span className={`mono ${(r.bank.chgPct ?? 0) >= 0 ? 'bull' : 'bear'}`}>{pct(r.bank.chgPct)}</span>
        <em className={trendCls(r.bank.tfTrend)}>TF {trendLabel(r.bank.tfTrend)}</em><em className={trendCls(r.bank.dayTrend)}>D {trendLabel(r.bank.dayTrend)}</em></div>
      <div><small>INDIA VIX</small><b className={`mono ${vixCls}`}>{f2(r.vix.ltp)}</b> <span className="mono dim">{pct(r.vix.chgPct)}</span><em className={vixCls}>{r.vix.level}</em></div>
      <div><small>F&amp;O BAN</small><b>{r.ban == null ? '—' : r.ban.length}</b><em className="dim" title={r.ban?.join(', ')}>{r.ban == null ? 'unavailable' : r.ban.slice(0, 3).join(', ') || 'none'}</em></div>
      <div><small>Results (10 days)</small><b>{r.earnings == null ? '—' : Object.keys(r.earnings).length}</b><em className="dim">{r.earnings == null ? 'calendar unavailable' : 'stocks flagged'}</em></div>
    </div>
  );
}

/** Compact chips for board tiles / table rows */
export function CtxChips({ c, max = 4 }: { c: Context; max?: number }) {
  const chips: { t: string; cls: string; title?: string }[] = [];
  if (c.flags.ban) chips.push({ t: 'BAN', cls: 'bearp', title: 'In F&O ban — no fresh positions' });
  if (c.flags.earnings) chips.push({ t: `Results ${c.flags.earnings.slice(5)}`, cls: 'goldp' });
  if (c.oi && c.oi.buildup !== 'Neutral') chips.push({ t: c.oi.buildup, cls: c.oi.signal > 0 ? 'bullp' : 'bearp', title: `Fut OI ${pct(c.oi.oiChgPct)}` });
  if (c.htf) for (const f of c.htf.frames) chips.push({ t: `${f.tf.toUpperCase()} ${f.label === 'neutral' ? '–' : f.label === 'bullish' ? '↑' : '↓'}`, cls: biasCls(f.label) });
  if (c.regime?.against) chips.push({ t: `vs ${c.regime.ref}`, cls: 'bearp', title: 'Against reference index trend' });
  return <span className="chips">{chips.slice(0, max).map(x => <span key={x.t} className={`chip ${x.cls}`} title={x.title}>{x.t}</span>)}</span>;
}

export function ScoreBreakdown({ p, score, ctx }: { p: number | null; score: number; ctx: Context | null }) {
  if (p == null) return <p className="muted">No active order block in the trend direction, so no score is produced.</p>;
  return (
    <div className="breakdown">
      <p className="score-note">The model probability is adjusted by the context factors below to produce the final score.</p>
      <div><span>Model probability (zone holds to +1R)</span><b className="mono">{(p * 100).toFixed(1)}%</b></div>
      {ctx?.adjustments.map(a => <div key={a.key + a.label}><span>{a.label}</span><b className={`mono ${a.delta >= 0 ? 'bull' : 'bear'}`}>{a.delta >= 0 ? '+' : ''}{a.delta.toFixed(2)} log-odds</b></div>)}
      <div className="total"><span>Final score</span><b className="mono grad">{score}</b></div>
    </div>
  );
}

export function ScoreDetails({ pModel, score, rank, calibrated, ctx }: {
  pModel: number | null; score: number; rank: number; calibrated: boolean; ctx: Context;
}) {
  return (
    <details className="score-details">
      <summary>Why this score?</summary>
      {pModel == null ? (
        <p>No active order block is available. The score is a directional-bias fallback, so context adjustments are not applied.</p>
      ) : (
        <>
          <p>Base model probability: <b>{(pModel * 100).toFixed(1)}%</b> to reach +1R before the stop. {calibrated ? 'The model is calibrated.' : 'The model is uncalibrated and uses prior weights.'}</p>
          <p>Context adjustments (log-odds):</p>
          {ctx.adjustments.length ? (
            <ul>{ctx.adjustments.map(a => <li key={a.key + a.label}>{a.label}: <b className={a.delta >= 0 ? 'bull' : 'bear'}>{a.delta >= 0 ? '+' : ''}{a.delta.toFixed(2)}</b></li>)}</ul>
          ) : <p>No context adjustments were applied.</p>}
        </>
      )}
      <p>Final score: <b>{score}/100</b>. Rank: <b>{rank}</b>; ranking also weights the score by proximity to the active order block.</p>
    </details>
  );
}

export function OiPanel({ c }: { c: Context | null }) {
  const oi = c?.oi;
  if (!oi) return <p className="muted">Futures OI unavailable (pre-open, or the instrument has no OI yet).</p>;
  return (
    <div className="kv">
      <div><small>Build-up</small><b className={oi.signal > 0 ? 'bull' : oi.signal < 0 ? 'bear' : ''}>{oi.buildup}</b></div>
      <div><small>Futures price change</small><b>{pct(oi.priceChgPct)}</b></div>
      <div><small>OI chg</small><b>{pct(oi.oiChgPct)}</b></div>
      <div><small>Open interest</small><b>{oi.oi.toLocaleString('en-IN')}</b></div>
    </div>
  );
}

export function HtfPanel({ c }: { c: Context | null }) {
  const h = c?.htf;
  if (!h) return <p className="muted">Higher-timeframe data unavailable.</p>;
  return (
    <div className="kv">
      {h.frames.map(f => <div key={f.tf}><small>{f.tf.toUpperCase()} trend</small><b className={trendCls(f.trend)}>{f.label} ({f.trend.toFixed(2)})</b></div>)}
      <div><small>Alignment</small><b className={trendCls(h.align)}>{h.align.toFixed(2)}</b></div>
      <div><small>OB confluence</small><b className={h.confluence ? 'bull' : 'muted'}>{h.confluence ? 'Yes' : 'No'}</b></div>
    </div>
  );
}

export function RegimePanel({ c }: { c: Context | null }) {
  const r = c?.regime;
  if (!r) return <p className="muted">Index regime unavailable.</p>;
  return (
    <div className="kv">
      <div><small>Reference index</small><b>{r.ref}</b></div>
      <div><small>Correlation / β</small><b>{r.corr.toFixed(2)} / {r.beta.toFixed(2)}</b></div>
      <div><small>Index trend</small><b className={trendCls(r.refTrend)}>{r.refTrend.toFixed(2)}</b></div>
      <div><small>Signal vs index</small><b className={r.against ? 'bear' : 'bull'}>{r.against ? 'Against' : 'OK'}</b></div>
      <div><small>VIX filter</small><b className={r.vixPenalty ? 'bear' : 'bull'}>{r.vixPenalty ? 'Penalised' : 'OK'}</b></div>
      <div><small>Flags</small><b>{c?.flags.ban ? 'F&O BAN' : c?.flags.earnings ? `Results ${c.flags.earnings}` : 'None'}</b></div>
    </div>
  );
}

export function WallsPanel({ c }: { c: Context | null }) {
  const w = c?.walls;
  if (!w) return <p className="muted">Option chain unavailable.</p>;
  return (
    <>
      <div className="kv">
        <div><small>Call wall (resistance)</small><b className="bear">{f2(w.callWall)}</b></div>
        <div><small>Put wall (support)</small><b className="bull">{f2(w.putWall)}</b></div>
        <div><small>PCR</small><b>{w.pcr == null ? '—' : w.pcr.toFixed(2)}</b></div>
        <div><small>Max pain</small><b>{f2(w.maxPain)}</b></div>
        <div><small>ATM IV</small><b>{w.atmIv == null ? '—' : w.atmIv.toFixed(1) + '%'}</b></div>
        <div><small>Expiry</small><b>{w.expiry}</b></div>
      </div>
      <table className="tbl" style={{ marginTop: 12 }}><thead><tr><th>Top call OI</th><th>Chg</th><th>Top put OI</th><th>Chg</th></tr></thead>
        <tbody>{[0, 1, 2].map(i => <tr key={i}>
          <td className="mono">{w.topCalls[i] ? `${w.topCalls[i].strike} · ${w.topCalls[i].oi.toLocaleString('en-IN')}` : '—'}</td>
          <td className={`mono ${(w.topCalls[i]?.chgOi ?? 0) >= 0 ? 'bull' : 'bear'}`}>{w.topCalls[i]?.chgOi.toLocaleString('en-IN') ?? ''}</td>
          <td className="mono">{w.topPuts[i] ? `${w.topPuts[i].strike} · ${w.topPuts[i].oi.toLocaleString('en-IN')}` : '—'}</td>
          <td className={`mono ${(w.topPuts[i]?.chgOi ?? 0) >= 0 ? 'bull' : 'bear'}`}>{w.topPuts[i]?.chgOi.toLocaleString('en-IN') ?? ''}</td>
        </tr>)}</tbody></table>
    </>
  );
}
