'use client';
import { useState } from 'react';
import type { BtStats, Timeframe } from '@/lib/types';
import { f2 } from './fmt';
import { fmtIST } from '@/lib/time';

type Resp = { symbol: string; tf: Timeframe; bars: number; from: number | null; to: number | null; all: BtStats; signals: BtStats;
  recent: { t: number; side: 'bull' | 'bear'; entry: number; sl: number; p: number; hit1R: boolean; r2: number; bars: number }[];
  model: { calibrated: boolean; trainedAt: string | null; samples: number; oos: { auc: number; brier: number; baseRate: number; samples: number } | null };
  costPctPerSide: number };

const P = (x: number) => `${(x * 100).toFixed(1)}%`;

function StatGrid({ s }: { s: BtStats }) {
  return (
    <div className="kv">
      <div><small>Trades</small><b>{s.trades}</b></div>
      <div><small>TP1 reached</small><b>{P(s.hitRate1R)}</b></div>
      <div><small>TP2 reached</small><b>{P(s.hitRate2R)}</b></div>
      <div><small>TP3 reached</small><b>{P(s.hitRate3R)}</b></div>
      <div><small>Profitable trades</small><b>{P(s.winRate2R)}</b></div>
      <div><small>Expectancy</small><b className={s.expectancy2R >= 0 ? 'bull' : 'bear'}>{s.expectancy2R.toFixed(3)} R</b></div>
      <div><small>Profit factor</small><b>{s.profitFactor.toFixed(2)}</b></div>
      <div><small>Max drawdown</small><b>{s.maxDrawdownR.toFixed(1)} R</b></div>
      <div><small>Average MFE / MAE</small><b title="Maximum favorable excursion / maximum adverse excursion">{s.avgMfeR.toFixed(2)} / {s.avgMaeR.toFixed(2)} R</b></div>
      <div><small>Average trading cost</small><b>{s.costR.toFixed(3)} R</b></div>
    </div>
  );
}

export default function BacktestPanel({ symbol, tf }: { symbol: string; tf: Timeframe }) {
  const [d, setD] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/backtest?symbol=${encodeURIComponent(symbol)}&tf=${tf}`, { cache: 'no-store' });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Backtest failed'); setD(j);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const stale = d && (d.symbol !== symbol || d.tf !== tf);
  return (
    <div className="card" style={{ padding: 'var(--card-padding)', marginTop: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <h3>Backtest — {symbol} · {tf.toUpperCase()}</h3>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Running…' : d && !stale ? 'Re-run' : 'Run backtest'}</button>
      </div>
      <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
        Walk-forward backtest designed to avoid look-ahead bias. Each order block is evaluated at its first retest, with entry at the block edge and a stop loss 0.2 ATR beyond the block. Exits follow the current plan: 50% at 1R (stop moved to entry), 30% at 2R (stop moved to 1R) and 20% at 3R, with a 40-bar time stop. Estimated costs are 0.06% per side (brokerage, securities transaction tax and slippage). If a stop loss and target occur in the same candle, the stop loss is assumed to execute first.
      </p>
      {err && <div className="notice err">⚠ {err}</div>}
      {d && !stale && (
        <>
          <p className="muted" style={{ marginBottom: 12, fontSize: 14 }}>{d.bars.toLocaleString('en-IN')} bars{d.from && d.to ? ` · ${fmtIST(d.from, true)} → ${fmtIST(d.to, true)}` : ''}</p>
          <div className="grid2">
            <div><h4 style={{ marginBottom: 10 }}>Stoclio-filtered signals <span className="dim" style={{ fontWeight: 400 }}>(directionally aligned; excludes range-bound conditions)</span></h4><StatGrid s={d.signals} /></div>
            <div><h4 style={{ marginBottom: 10 }}>All order-block retests</h4><StatGrid s={d.all} /></div>
          </div>
          <div className="grid2" style={{ marginTop: 20 }}>
            <div>
              <h4 style={{ marginBottom: 10 }}>Calibration — predicted vs. observed +1R outcomes</h4>
              {d.signals.reliability.filter(r => r.n > 0).map(r => (
                <div key={r.bucket} className="rel">
                  <span className="mono dim">{r.bucket} <small>({r.n})</small></span>
                  <span className="track"><span style={{ width: `${r.actual * 100}%`, background: 'linear-gradient(90deg,#3b82f6,#22d3ee)' }} /></span>
                  <span className="mono">{P(r.actual)}</span>
                </div>
              ))}
              <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
                {d.model.calibrated
                  ? `Model fitted ${d.model.trainedAt?.slice(0, 10)} on ${d.model.samples.toLocaleString('en-IN')} trades${d.model.oos ? ` · out-of-sample AUC ${d.model.oos.auc.toFixed(3)}` : ''}.`
                  : 'Scores currently use prior weights; they represent calibrated probabilities only after the model is fitted to the full F&O universe.'}
                {d.signals.brier != null && ` Brier ${d.signals.brier.toFixed(3)} on this stock.`}
              </p>
            </div>
            <div>
              <h4 style={{ marginBottom: 10 }}>Recent backtest trades</h4>
              <div className="tbl-wrap" style={{ maxHeight: 280 }}>
                <table className="tbl"><thead><tr><th>Time</th><th>Side</th><th>Entry</th><th>Score</th><th>TP1</th><th>Result</th></tr></thead>
                  <tbody>{d.recent.map(t => <tr key={t.t + t.side}>
                    <td className="mono">{fmtIST(t.t, true)}</td><td className={t.side === 'bull' ? 'bull' : 'bear'}>{t.side === 'bull' ? 'Long' : 'Short'}</td>
                    <td className="mono">{f2(t.entry)}</td><td className="mono">{Math.round(t.p * 100)}</td>
                    <td>{t.hit1R ? '✓' : '✕'}</td><td className={`mono ${t.r2 >= 0 ? 'bull' : 'bear'}`}>{t.r2.toFixed(2)} R</td>
                  </tr>)}</tbody></table>
              </div>
            </div>
          </div>
          <p className="dim" style={{ fontSize: 12, marginTop: 12 }}>Past performance on historical data does not guarantee future results. A single stock&apos;s sample is small — judge the model on the universe-wide report.</p>
        </>
      )}
    </div>
  );
}
