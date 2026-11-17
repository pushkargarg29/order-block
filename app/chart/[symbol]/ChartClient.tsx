'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Analysis, Candle, Timeframe, Context, RegimeInfo } from '@/lib/types';
import CandleChart from '@/components/CandleChart';
import Chart3D from '@/components/three/Chart3D';
import TfSwitch from '@/components/TfSwitch';
import LiveBadge from '@/components/LiveBadge';
import { f2, pct } from '@/components/fmt';
import { isMarketOpen, fmtIST } from '@/lib/time';
import { cachedChart, prefetchChart, rememberChart } from '@/components/chartCache';
import { ScoreBreakdown, OiPanel, HtfPanel, RegimePanel, WallsPanel, CtxChips, RegimeBar, ModelBadge } from '@/components/Context';
import BacktestPanel from '@/components/BacktestPanel';

type Resp = { symbol: string; name: string; lot: number; tf: Timeframe; candles: Candle[]; analysis: Analysis | null; ctx: Context | null; regime: RegimeInfo | null;
  model: { calibrated: boolean; trainedAt: string | null }; quote: { ltp: number; changePct: number } | null; at: number };

export default function ChartClient({ symbol, initialTf, initial = null }: { symbol: string; initialTf: Timeframe; initial?: Resp | null }) {
  const [tf, setTf] = useState<Timeframe>(initialTf);
  const [d, setD] = useState<Resp | null>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState(symbol);
  const [universe, setUniverse] = useState<string[]>([]);
  const [opt, setOpt] = useState({ fvg: true, ema: true, plan: true, walls: true });
  const [view3d, setView3d] = useState(false);
  const router = useRouter();

  useEffect(() => { fetch('/api/universe').then(r => r.json()).then(j => setUniverse((j.symbols || []).map((s: { symbol: string }) => s.symbol))).catch(() => {}); }, []);

  useEffect(() => {
    let stop = false;
    const show = (j: Resp) => { if (!stop) { setD(j); setErr(null); rememberChart(symbol, tf, j, j.at); } };
    const load = async (preferCache: boolean) => {
      try {
        const hit = preferCache ? cachedChart<Resp>(symbol, tf) : null;
        show(await (hit ?? prefetchChart(symbol, tf).then(x => x as Resp)));
      } catch (e) { if (!stop) setErr((e as Error).message); }
    };
    const fromServer = initial && initial.symbol === symbol && initial.tf === tf;
    if (fromServer) rememberChart(symbol, tf, initial, initial!.at);
    else {
      const hit = cachedChart<Resp>(symbol, tf, 120000);
      if (!hit) setD(prev => (prev && prev.symbol === symbol ? prev : null)); // keep the old chart visible while switching timeframe
      load(true);
    }
    const id = setInterval(() => { if (isMarketOpen() && document.visibilityState === 'visible') load(false); }, tf === '1d' ? 60000 : 15000);
    return () => { stop = true; clearInterval(id); };
  }, [symbol, tf]); // eslint-disable-line react-hooks/exhaustive-deps

  // preload the other timeframes in the background so switching is instant
  useEffect(() => {
    const t = setTimeout(() => (['5m', '15m', '1h', '1d'] as Timeframe[]).filter(x => x !== tf).forEach(x => prefetchChart(symbol, x).catch(() => {})), 1500);
    return () => clearTimeout(t);
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = d?.analysis ?? null;
  const go = (s: string) => { const v = s.trim().toUpperCase(); if (/^[A-Z0-9&\-]{1,20}$/.test(v)) router.push(`/chart/${encodeURIComponent(v)}?tf=${tf}`); };
  const biasPill = a ? (a.bias === 'bullish' ? 'bullp' : a.bias === 'bearish' ? 'bearp' : 'neutp') : 'neutp';

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1>{symbol}</h1>
            {d?.quote && <><span className="mono" style={{ fontSize: 22 }}>{f2(d.quote.ltp)}</span><span className={`mono ${d.quote.changePct >= 0 ? 'bull' : 'bear'}`}>{pct(d.quote.changePct)}</span></>}
            {a && <span className={`pill ${biasPill}`}>{a.bias.toUpperCase()} · Score {a.score}</span>}
            {d && <ModelBadge calibrated={d.model.calibrated} trainedAt={d.model.trainedAt} />}
          </div>
          {d?.ctx && <div style={{ marginTop: 8 }}><CtxChips c={d.ctx} max={8} /></div>}
          <p className="muted" style={{ marginTop: 6 }}>{d?.name ?? 'Order Block Chart'}{d?.lot ? ` · Lot ${d.lot}` : ''}</p>
        </div>
        <div className="toolbar">
          <form onSubmit={e => { e.preventDefault(); go(q); }}>
            <input className="input" list="fno-list" value={q} onChange={e => setQ(e.target.value.toUpperCase().slice(0, 20))} placeholder="Search F&O stock…" aria-label="Symbol" />
            <datalist id="fno-list">{universe.map(s => <option key={s} value={s} />)}</datalist>
          </form>
          <TfSwitch value={tf} onChange={t => { setTf(t); router.replace(`/chart/${encodeURIComponent(symbol)}?tf=${t}`, { scroll: false }); }} />
        </div>
      </div>

      {err && <div className="notice err" style={{ marginBottom: 16 }}>⚠ {err}</div>}
      <RegimeBar r={d?.regime ?? null} />
      {d?.ctx?.flags.ban && <div className="notice err" style={{ marginBottom: 16 }}>⚠ {symbol} is in the F&amp;O ban period — no fresh derivative positions allowed.</div>}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
          <LiveBadge at={d?.at} />
          <div className="seg" role="tablist" aria-label="Chart view">
            <button type="button" className={!view3d ? 'on' : ''} onClick={() => setView3d(false)} aria-selected={!view3d} role="tab">2D</button>
            <button type="button" className={view3d ? 'on' : ''} onClick={() => setView3d(true)} aria-selected={view3d} role="tab">3D</button>
          </div>
          <span style={{ flex: 1 }} />
          {(['fvg', 'ema', 'plan', 'walls'] as const).map(k => (
            <label key={k} className="muted" style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={opt[k]} onChange={e => setOpt(o => ({ ...o, [k]: e.target.checked }))} />
              {k === 'fvg' ? 'Fair value gaps' : k === 'ema' ? 'EMA 20/50' : k === 'plan' ? 'Trade plan' : 'Option OI walls'}
            </label>
          ))}
        </div>
        {d && view3d ? <Chart3D candles={d.candles} a={a} walls={opt.walls ? d.ctx?.walls ?? null : null} /> : d ? <CandleChart candles={d.candles} a={a} showFvg={opt.fvg} showEma={opt.ema} showPlan={opt.plan} daily={d.tf === '1d'} walls={d.ctx?.walls ?? null} showWalls={opt.walls} /> : <div className="skeleton chart-skel" style={{ borderRadius: 0 }} />}
        <div className="legend">
          <span><i style={{ background: 'rgba(56,189,248,.35)', border: '1px solid #38bdf8' }} />Bullish OB</span>
          <span><i style={{ background: 'rgba(248,113,113,.35)', border: '1px solid #f87171' }} />Bearish OB</span>
          <span><i style={{ background: '#fbbf24' }} />Liquidity / sweep</span>
          <span><i style={{ background: 'rgba(59,130,246,.2)' }} />FVG</span>
          <span><i style={{ background: '#f87171' }} />Call wall</span><span><i style={{ background: '#34d399' }} />Put wall</span><span><i style={{ background: '#a78bfa' }} />Max pain</span>
          <span className="dim">Scroll to zoom · Drag to pan · Double-click to reset</span>
        </div>
      </div>

      {a && (
        <div className="grid3" style={{ marginTop: 20 }}>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 14 }}>Key levels</h3>
            <div className="kv">
              <div><small>Resistance</small><b>{f2(a.resistance)}</b></div>
              <div><small>Support</small><b>{f2(a.support)}</b></div>
              <div><small>Liquidity</small><b className="gold">{f2(a.liquidityLevel)}</b></div>
              <div><small>Active OB</small><b>{a.activeZone ? `${f2(a.activeZone.bottom)}–${f2(a.activeZone.top)}` : '—'}</b></div>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 14 }}>Trade plan</h3>
            {a.plan ? <>
              <div className="kv">
                <div><small>{a.plan.side === 'bull' ? 'Long entry' : 'Short entry'}</small><b className="grad">{f2(a.plan.entry)}</b></div>
                <div><small>Stop loss</small><b className="bear">{f2(a.plan.sl)}</b></div>
                <div><small>Risk</small><b>{a.plan.riskPct.toFixed(2)}%</b></div>
                <div><small>Status</small><b style={{ color: a.plan.trigger === 'at-entry' ? 'var(--sky)' : undefined }}>{a.plan.trigger === 'at-entry' ? 'At entry' : `Wait ${a.plan.distPct.toFixed(2)}%`}</b></div>
              </div>
              <div className="tp-grid">{a.plan.tps.map((t, i) => <div key={i}><small>TP{i + 1}</small><b>{f2(t.price)}</b><span>{t.r.toFixed(2)}R · {t.source}</span></div>)}</div>
              <ol className="exit-rules">{a.plan.exitRules.map(x => <li key={x}>{x}</li>)}</ol>
              <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>{a.plan.validity}. Algorithmic plan, not a recommendation.</p>
            </> : <p className="muted">No trade plan: price is range-bound with low directional conviction.</p>}
          </div>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 14 }}>Quant read</h3>
            <div className="kv">
              <div><small>Bias score</small><b>{a.biasScore.toFixed(2)}</b></div>
              <div><small>Efficiency</small><b>{a.er.toFixed(2)}</b></div>
              <div><small>RSI 14</small><b>{a.rsi.toFixed(1)}</b></div>
              <div><small>Rel. volume</small><b>{a.rvol.toFixed(2)}×</b></div>
              <div><small>ATR 14</small><b>{f2(a.atr)}</b></div>
              <div><small>VWAP</small><b>{f2(a.vwap)}</b></div>
            </div>
          </div>
        </div>
      )}
      {a && (
        <div className="grid2" style={{ marginTop: 20 }}>
          <div className="card" style={{ padding: 20 }}><h3 style={{ marginBottom: 14 }}>Score breakdown</h3><ScoreBreakdown p={a.pModel} score={a.score} ctx={d?.ctx ?? null} /></div>
          <div className="card" style={{ padding: 20 }}><h3 style={{ marginBottom: 14 }}>Futures OI build-up</h3><OiPanel c={d?.ctx ?? null} /></div>
          <div className="card" style={{ padding: 20 }}><h3 style={{ marginBottom: 14 }}>Higher-timeframe agreement</h3><HtfPanel c={d?.ctx ?? null} /></div>
          <div className="card" style={{ padding: 20 }}><h3 style={{ marginBottom: 14 }}>Index &amp; VIX regime</h3><RegimePanel c={d?.ctx ?? null} /></div>
          <div className="card" style={{ padding: 20, gridColumn: '1/-1' }}><h3 style={{ marginBottom: 14 }}>Option chain OI walls</h3><WallsPanel c={d?.ctx ?? null} /></div>
        </div>
      )}
      <BacktestPanel symbol={symbol} tf={tf} />
      {a && a.events.length > 0 && (
        <div className="card" style={{ padding: 20, marginTop: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Structure log</h3>
          <div className="tbl-wrap" style={{ maxHeight: 300 }}>
            <table className="tbl"><thead><tr><th>Time (IST)</th><th>Event</th><th>Direction</th><th>Level</th></tr></thead>
              <tbody>{[...a.events].reverse().map(e => <tr key={e.t + e.kind + e.dir}><td className="mono">{fmtIST(e.t, true)}</td><td>{e.kind}</td><td className={e.dir === 'bull' ? 'bull' : 'bear'}>{e.dir === 'bull' ? 'Bullish' : 'Bearish'}</td><td className="mono">{f2(e.level)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
