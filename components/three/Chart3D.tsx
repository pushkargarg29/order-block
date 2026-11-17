'use client';
import { useMemo, useRef, useState } from 'react';
import type { Analysis, Candle, OptionWalls } from '@/lib/types';
import { P, box, hexRgb, label, paint, seg, rgba, type Prim, type V3, type View } from './engine';
import { useOrbit } from './useOrbit';
import Controls3D from './Controls';
import { f2 } from '../fmt';
import { fmtIST } from '@/lib/time';

const UP = hexRgb('#34d399'), DN = hexRgb('#f87171'), BULLZ = hexRgb('#38bdf8'), BEARZ = hexRgb('#f87171'), VOL = hexRgb('#3b82f6');
const W = 7, H = 3.4, FLOOR = -4.1;

/** 3D order-block chart: candles as bars, order blocks as translucent slabs, volume on the floor, liquidity & OI walls as rails. */
export default function Chart3D({ candles, a, walls, bars = 90, height = 560 }: { candles: Candle[]; a: Analysis | null; walls: OptionWalls | null; bars?: number; height?: number }) {
  const [tip, setTip] = useState<{ x: number; y: number; c: Candle } | null>(null);
  const hits = useRef<{ x: number; y: number; c: Candle }[]>([]);

  const m = useMemo(() => {
    const vis = candles.slice(-bars);
    if (!vis.length) return null;
    let hi = Math.max(...vis.map(c => c.h)), lo = Math.min(...vis.map(c => c.l));
    const pad = (hi - lo) * 0.06 || 1; hi += pad; lo -= pad;
    const step = (2 * W) / vis.length;
    const X = (i: number) => -W + (i + 0.5) * step;
    const Y = (p: number) => -H + ((p - lo) / (hi - lo)) * 2 * H;
    const vmax = Math.max(...vis.map(c => c.v)) || 1;
    const idx = new Map(vis.map((c, i) => [c.t, i]));
    const firstT = vis[0].t;
    return { vis, hi, lo, step, X, Y, vmax, idx, firstT };
  }, [candles, bars]);

  const { wrapRef, canvasRef, zoomBy, reset } = useOrbit((ctx: CanvasRenderingContext2D, v: View) => {
    if (!m) return;
    const { vis, step, X, Y, vmax, idx, firstT, hi, lo } = m;
    const prims: Prim[] = [];
    // floor grid
    for (let gx = -W; gx <= W + 1e-6; gx += W / 4) seg(prims, [gx, FLOOR, -2.2], [gx, FLOOR, 2.2], v, 'rgba(31,55,102,.5)');
    for (let gz = -2.2; gz <= 2.21; gz += 1.1) seg(prims, [-W, FLOOR, gz], [W, FLOOR, gz], v, 'rgba(31,55,102,.5)');
    // back price grid
    for (let k = 0; k <= 4; k++) { const y = -H + (k / 4) * 2 * H; seg(prims, [-W, y, 1.6], [W, y, 1.6], v, 'rgba(31,55,102,.35)'); }

    const bw = step * 0.36, bd = 0.28;
    vis.forEach((c, i) => {
      const x = X(i), up = c.c >= c.o, col = up ? UP : DN;
      const y0 = Y(Math.min(c.o, c.c)), y1 = Math.max(Y(Math.max(c.o, c.c)), y0 + 0.02);
      box(prims, [x - bw, y0, -bd], [x + bw, y1, bd], v, col, 1);
      seg(prims, [x, Y(c.l), 0], [x, Y(c.h), 0], v, rgba(col, 1.1, 0.9), 1.2);
      const vh = (c.v / vmax) * 1.6;
      if (vh > 0.01) box(prims, [x - bw, FLOOR, 1.0], [x + bw, FLOOR + vh, 1.0 + bd * 2], v, VOL, 0.55);
    });

    if (a) {
      for (const z of a.zones) {
        if (z.invalidated) continue;
        if (z.top < lo || z.bottom > hi) continue;
        const s = z.startT < firstT ? 0 : idx.get(z.startT);
        if (s == null) continue;
        const col = z.side === 'bull' ? BULLZ : BEARZ;
        box(prims, [X(s) - step / 2, Y(Math.max(z.bottom, lo)), -0.75], [W, Y(Math.min(z.top, hi)), 0.75], v, col, 0.14 + z.strength * 0.14, rgba(col, 1, 0.55));
      }
      const rail = (p: number | null, color: string, dash?: number[]) => {
        if (p == null || p > hi || p < lo) return;
        seg(prims, [-W, Y(p), 0.9], [W, Y(p), 0.9], v, color, 1.4, dash);
      };
      for (const l of a.liquidity) rail(l.price, 'rgba(251,191,36,.75)', [3, 5]);
      rail(a.support, 'rgba(142,163,199,.7)', [6, 6]);
      rail(a.resistance, 'rgba(142,163,199,.7)', [6, 6]);
      if (walls) { rail(walls.callWall, 'rgba(248,113,113,.9)', [10, 4]); rail(walls.putWall, 'rgba(52,211,153,.9)', [10, 4]); }
    }
    paint(ctx, prims);

    // labels (2D overlay)
    for (let k = 0; k <= 4; k++) {
      const price = lo + (k / 4) * (hi - lo); const s = P([-W - 0.2, Y(price), 1.6], v);
      label(ctx, f2(price), s[0], s[1], '#b4c3df', 'right', 10, 500);
    }
    const tl = [0, Math.floor(vis.length / 2), vis.length - 1];
    for (const i of tl) { const s = P([X(i), FLOOR - 0.35, -2.2], v); label(ctx, fmtIST(vis[i].t, true), s[0], s[1], '#93a6c8', 'center', 10, 500); }
    const last = vis[vis.length - 1]; const ls = P([W + 0.25, Y(last.c), 0], v);
    label(ctx, f2(last.c), ls[0], ls[1], '#38bdf8', 'left', 11, 800);
    if (a) {
      const lab = (p: number | null, t: string, c: string) => { if (p == null || p > hi || p < lo) return; const s = P([W + 0.25, Y(p), 0.9], v); label(ctx, `${t} ${f2(p)}`, s[0], s[1], c, 'left', 10, 700); };
      if (a.activeZone) lab((a.activeZone.top + a.activeZone.bottom) / 2, a.activeZone.side === 'bull' ? 'Demand OB' : 'Supply OB', a.activeZone.side === 'bull' ? '#7dd3fc' : '#fca5a5');
      lab(a.liquidityLevel, 'Liquidity', '#fbbf24');
      if (walls) { lab(walls.callWall, 'Call wall', '#f87171'); lab(walls.putWall, 'Put wall', '#34d399'); }
    }
    hits.current = vis.map((c, i) => { const s = P([X(i), Y((c.o + c.c) / 2), 0], v); return { x: s[0], y: s[1], c }; });
  }, [m, a, walls], {
    yaw: -0.45, pitch: -0.3,
    onHover: (x, y) => {
      let best: (typeof hits.current)[number] | null = null, bd = 14;
      for (const h of hits.current) { const d = Math.abs(h.x - x) + Math.abs(h.y - y) * 0.25; if (d < bd) { bd = d; best = h; } }
      setTip(best ? { x: best.x, y: best.y, c: best.c } : null);
    },
    onLeave: () => setTip(null)
  });

  if (!m) return <div className="notice">Chart data is not available for this timeframe.</div>;
  return (
    <div className="scene3d">
      <div ref={wrapRef} className="scene3d-stage" style={{ height: `min(${height}px, 72vh)` }}>
        <canvas ref={canvasRef} tabIndex={0} role="img" aria-label="3D candlestick chart with order blocks. Use arrow keys to rotate." />
        {tip && (
          <div className="tip3d" style={{ left: tip.x + 14, top: tip.y + 14 }}>
            <b>{fmtIST(tip.c.t, true)}</b>
            <div className="mono">O {f2(tip.c.o)} H {f2(tip.c.h)}</div>
            <div className="mono">L {f2(tip.c.l)} C <span className={tip.c.c >= tip.c.o ? 'bull' : 'bear'}>{f2(tip.c.c)}</span></div>
            <div className="dim mono">Vol {tip.c.v.toLocaleString('en-IN')}</div>
          </div>
        )}
      </div>
      <Controls3D zoomBy={zoomBy} reset={reset} hint="Drag to rotate · arrow keys work too · hover a candle for OHLC" />
    </div>
  );
}
