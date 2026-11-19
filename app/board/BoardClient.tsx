'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ScanResult } from '@/lib/types';
import { useMemo, useState } from 'react';
import type { ScanRow, Timeframe } from '@/lib/types';
import { useLiveQuotes, useScan } from '@/components/useScan';
import TfSwitch from '@/components/TfSwitch';
import LiveBadge from '@/components/LiveBadge';
import Distribution from '@/components/Distribution';
import MarketUniverse3D from '@/components/three/MarketUniverse3D';
import { f2, pct } from '@/components/fmt';
import { RegimeBar, CtxChips, ModelBadge, EnrichmentCoverage, ScanDiagnostics } from '@/components/Context';

function Tile({ r, i, side, live, tf }: { r: ScanRow; i: number; side: 'bull' | 'bear'; live?: { ltp: number; changePct: number }; tf: Timeframe }) {
  const ch = live?.changePct ?? r.changePct;
  const color = side === 'bull' ? 'var(--bull)' : 'var(--bear)';
  return (
    <div className="rank">
      <span className="n">{String(i + 1).padStart(2, '0')}</span>
      <Link href={`/chart/${encodeURIComponent(r.symbol)}?tf=${tf}`} className={`tile ${i === 0 ? (side === 'bull' ? 'top-bull' : 'top-bear') : ''}`}>
        <span className="sym">{r.symbol}</span>
        <span className="mono" style={{ textAlign: 'right' }}>{f2(live?.ltp ?? r.ltp)}</span>
        <span className={`mono ${ch != null && ch >= 0 ? 'bull' : 'bear'}`} style={{ fontSize: 13 }}>{pct(ch)}</span>
        <span className="mono dim" style={{ fontSize: 12, textAlign: 'right' }}>
          {r.zone ? `Order block ${f2(r.zone.bottom)}–${f2(r.zone.top)}` : 'No active order block'}
        </span>
        <span className="bar"><span style={{ width: `${r.score}%`, background: `linear-gradient(90deg, ${color}, #38bdf8)` }} /></span>
        <CtxChips c={r.ctx} />
        {r.plan && <span className="mono dim" style={{ fontSize: 11, gridColumn: '1/-1' }}>
          Entry {f2(r.plan.entry)} · Stop loss {f2(r.plan.sl)} · Targets {r.plan.tps.map(t => f2(t.price)).join(' / ')} · Score {r.score}
        </span>}
      </Link>
    </div>
  );
}

export default function BoardClient({ initial = null }: { initial?: ScanResult | null }) {
  const [tf, setTf] = useState<Timeframe>('15m');
  const [view3d, setView3d] = useState(true);
  const { data, error, loading } = useScan(tf, initial);
  const router = useRouter();
  const rows = data?.rows ?? [];
  // ranked by score × proximity to the order block; banned stocks never appear in the top lists
  const pick = (b: 'bullish' | 'bearish') => rows.filter(r => r.bias === b && r.zone && !r.ctx.flags.ban).sort((a, x) => x.rank - a.rank).slice(0, 20);
  const bulls = useMemo(() => pick('bullish'), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const bears = useMemo(() => pick('bearish'), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = useLiveQuotes([...bulls, ...bears].map(r => r.symbol));
  const choppy = rows.filter(r => r.choppy).length;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1><span className="grad">Liquidity Board</span></h1>
          <p className="muted" style={{ marginTop: 6 }}>Highest-ranked order-block setups across active NSE F&amp;O stocks, updated in real time.</p>
        </div>
        <div className="toolbar">{data && <ModelBadge fitted={data.model.fitted} trainedAt={data.model.trainedAt} />}<EnrichmentCoverage enrichment={data?.enrichment} /><LiveBadge at={data?.quoteAt === undefined ? data?.at : data.quoteAt} coverage={data?.quoteCoverage} scanCoverage={data?.scanCoverage} sampleLabel="Quotes sampled" /><ScanDiagnostics data={data} /><TfSwitch value={tf} onChange={setTf} /></div>
      </div>
      <RegimeBar r={data?.regime ?? null} />

      {error && <div className="notice err" style={{ marginBottom: 20 }}>⚠ {error}{data ? ' Showing the last available scan.' : ''}</div>}

      <div className="card" style={{ padding: 'var(--card-padding)', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 16, marginBottom: 10 }}>
          <span style={{ fontSize: 44, fontWeight: 850, color: 'var(--muted)' }}>{data ? data.scanned : '—'}</span>
          <div><b style={{ fontSize: 20 }}>NSE F&amp;O stocks scanned</b><div className="muted">for order-block and liquidity setups on {tf.toUpperCase()}</div></div>
          <span style={{ flex: 1 }} />
          <span className="pill bullp">{rows.filter(r => r.bias === 'bullish').length} Bullish</span>
          <span className="pill bearp">{rows.filter(r => r.bias === 'bearish').length} Bearish</span>
          <span className="pill neutp">{choppy} Range-bound</span>
        </div>
        <div className="seg" style={{ marginBottom: 12 }} role="tablist" aria-label="Distribution view">
          <button type="button" className={view3d ? 'on' : ''} onClick={() => setView3d(true)} aria-selected={view3d} role="tab">3D universe</button>
          <button type="button" className={!view3d ? 'on' : ''} onClick={() => setView3d(false)} aria-selected={!view3d} role="tab">Dot plot</button>
        </div>
        {loading && !data ? <div className="skeleton" style={{ height: view3d ? 480 : 220 }} />
          : view3d ? <MarketUniverse3D rows={rows} tf={tf} height={480} />
          : <Distribution rows={rows} onPick={s => router.push(`/chart/${encodeURIComponent(s)}?tf=${tf}`)} />}
        {loading && !data && <p className="dim" style={{ marginTop: 10, fontSize: 13 }}>The first scan of the day downloads historical data for each active NSE F&amp;O stock and may take one to two minutes. Subsequent scans use cached data.</p>}
      </div>

      <div className="board">
        <div className="card" style={{ padding: 'var(--card-padding)' }}>
          <h3 className="bull" style={{ marginBottom: 14 }}>↗ Bullish setups — highest-ranked first</h3>
          {loading && !data ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 62, marginBottom: 10 }} />)
            : bulls.length ? bulls.map((r, i) => <Tile key={r.symbol} r={r} i={i} side="bull" live={live[r.symbol]} tf={tf} />)
            : <p className="muted">No qualifying bullish setups are currently available.</p>}
        </div>
        <div className="card" style={{ padding: 'var(--card-padding)' }}>
          <h3 className="bear" style={{ marginBottom: 14 }}>↘ Bearish setups — highest-ranked first</h3>
          {loading && !data ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 62, marginBottom: 10 }} />)
            : bears.length ? bears.map((r, i) => <Tile key={r.symbol} r={r} i={i} side="bear" live={live[r.symbol]} tf={tf} />)
            : <p className="muted">No qualifying bearish setups are currently available.</p>}
        </div>
      </div>
      <p className="dim" style={{ fontSize: 13, marginTop: 18 }}>The score combines the model output with open-interest build-up, higher-timeframe alignment, the index and VIX regime, options open-interest walls and upcoming results. Prior model weights are not calibrated probabilities. Ranking also accounts for proximity to the block. Entry is set at the block edge; the stop loss is placed 0.2 ATR beyond the block; targets TP1, TP2 and TP3 are set at a minimum of 1R, 2R and 3R and may align with liquidity, market structure or open-interest walls. Securities under an F&amp;O ban are excluded. For educational purposes only; this is not investment advice.</p>
    </div>
  );
}
