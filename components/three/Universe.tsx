'use client';
import { useState } from 'react';
import type { Timeframe } from '@/lib/types';
import { useScan } from '../useScan';
import MarketUniverse3D from './MarketUniverse3D';

/** Self-loading live universe (homepage / X-Ray). */
export default function Universe({ height = 520, tf: initial = '15m' }: { height?: number; tf?: Timeframe }) {
  const [tf] = useState<Timeframe>(initial);
  const { data, error, loading } = useScan(tf);
  if (loading && !data) return <div className="skeleton" style={{ height }} />;
  if (error && !data) return <div className="notice err" style={{ minHeight: 120 }}>⚠ {error}</div>;
  if (!data?.rows.length) return <div className="notice">Live data will appear when the next scan completes.</div>;
  return (
    <>
      <div className="legend3d">
        <span><i style={{ background: '#34d399' }} />Bullish</span><span><i style={{ background: '#f87171' }} />Bearish</span>
        <span><i style={{ background: '#93a6c8' }} />Range-bound</span><span className="dim">Size = score · glow = top 10 · {data.scanned} live stocks · {tf}</span>
      </div>
      <MarketUniverse3D rows={data.rows} tf={tf} height={height} />
    </>
  );
}
