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
import { RegimeBar, CtxChips, ModelBadge } from '@/components/Context';

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
          {r.zone ? `OB ${f2(r.zone.bottom)}–${f2(r.zone.top)}` : 'No fresh OB'}
        </span>
        <span className="bar"><span style={{ width: `${r.score}%`, background: `linear-gradient(90deg, ${color}, #38bdf8)` }} /></span>
        <CtxChips c={r.ctx} />
        {r.plan && <span className="mono dim" style={{ fontSize: 11, gridColumn: '1/-1' }}>
          E {f2(r.plan.entry)} · SL {f2(r.plan.sl)} · TP {r.plan.tps.map(t => f2(t.price)).join(' / ')} · Score {r.score}
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
          <p className="muted" style={{ marginTop: 6 }}>Strongest order-block setups across all active NSE F&amp;O stocks, ranked live.</p>
        </div>
        <div className="toolbar">{data && <ModelBadge calibrated={data.model.calibrated} trainedAt={data.model.trainedAt} />}<LiveBadge at={data?.at} /><TfSwitch value={tf} onChange={setTf} /></div>
      </div>
      <RegimeBar r={data?.regime ?? null} />

      {error && <div className="notice err" style={{ marginBottom: 20 }}>⚠ {error}</div>}

      <div className="card" style={{ padding: 22, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 16, marginBottom: 10 }}>
          <span style={{ fontSize: 44, fontWeight: 850, color: 'var(--muted)' }}>{data ? data.scanned : '—'}</span>
          <div><b style={{ fontSize: 20 }}>F&amp;O stocks scanned</b><div className="muted">for order block &amp; liquidity on {tf.toUpperCase()}</div></div>
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
        {loading && !data && <p className="dim" style={{ marginTop: 10, fontSize: 13 }}>The first scan of the day downloads history for every F&amp;O stock and can take 1–2 minutes; later scans reuse the cache.</p>}
      </div>

      <div className="board">
        <div className="card" style={{ padding: 20 }}>
          <h3 className="bull" style={{ marginBottom: 14 }}>↗ Bullish — strongest first</h3>
          {loading && !data ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 62, marginBottom: 10 }} />)
            : bulls.length ? bulls.map((r, i) => <Tile key={r.symbol} r={r} i={i} side="bull" live={live[r.symbol]} tf={tf} />)
            : <p className="muted">No qualifying bullish setups at the moment.</p>}
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h3 className="bear" style={{ marginBottom: 14 }}>↘ Bearish — strongest first</h3>
          {loading && !data ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 62, marginBottom: 10 }} />)
            : bears.length ? bears.map((r, i) => <Tile key={r.symbol} r={r} i={i} side="bear" live={live[r.symbol]} tf={tf} />)
            : <p className="muted">No qualifying bearish setups at the moment.</p>}
        </div>
      </div>
      <p className="dim" style={{ fontSize: 13, marginTop: 18 }}>Score = model probability the order block holds to +1R, adjusted for OI build-up, higher-timeframe agreement, index/VIX regime, option OI walls and results dates. Ranking also weights proximity to the block. E = entry at block edge, SL = beyond block −0.2 ATR, TP = TP1 / TP2 / TP3 (≥1R / 2R / 3R, snapped to liquidity, structure or OI walls). Banned stocks are excluded. Educational analytics only — not investment advice.</p>
    </div>
  );
}
