'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScanRow, Timeframe } from '@/lib/types';
import { P, hexRgb, label, rgba, rot, proj, type V3, type View } from './engine';
import { useOrbit } from './useOrbit';
import Controls3D from './Controls';
import { f2, pct } from '../fmt';

const BULL = hexRgb('#34d399'), BEAR = hexRgb('#f87171'), CHOP = hexRgb('#93a6c8');
const S = 4; // half-size of the world cube

type Pt = { row: ScanRow; p: V3; c: [number, number, number]; r: number; top: boolean };

/**
 * Each active NSE F&O stock is represented as a point in 3D:
 *  X = signed directional score, Y = daily price change, Z = relative volume (log2).
 * Drag to rotate, move the pointer over a point for details, or select it to open the chart.
 */
export default function MarketUniverse3D({ rows, tf = '15m', height = 520 }: { rows: ScanRow[]; tf?: Timeframe; height?: number }) {
  const router = useRouter();
  const [tip, setTip] = useState<{ x: number; y: number; row: ScanRow } | null>(null);
  const hits = useRef<{ x: number; y: number; r: number; d: number; row: ScanRow }[]>([]);
  const hoverSym = useRef<string | null>(null);

  const pts = useMemo<Pt[]>(() => {
    const strongest = new Set(
      [...rows].filter(r => !r.choppy && r.bias !== 'neutral').sort((a, b) => b.rank - a.rank).slice(0, 10).map(r => r.symbol));
    return rows.map(row => {
      const x = (Math.max(-100, Math.min(100, row.signed)) / 100) * S;
      const y = (Math.max(-5, Math.min(5, row.changePct ?? 0)) / 5) * S;
      const z = (Math.max(-2, Math.min(2, Math.log2(Math.max(row.rvol, 0.01)))) / 2) * S;
      const c = row.choppy || row.bias === 'neutral' ? CHOP : row.signed >= 0 ? BULL : BEAR;
      return { row, p: [x, y, z] as V3, c, r: 2.2 + (row.score / 100) * 4.5, top: strongest.has(row.symbol) };
    });
  }, [rows]);

  const pick = (x: number, y: number) => {
    let best: (typeof hits.current)[number] | null = null;
    for (const h of hits.current) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d <= h.r + 6 && (!best || h.d < best.d)) best = h;
    }
    return best;
  };

  const { wrapRef, canvasRef, zoomBy, reset, invalidate } = useOrbit((ctx: CanvasRenderingContext2D, v: View) => {
    // floor grid
    ctx.lineWidth = 1;
    for (let i = -S; i <= S; i += S / 4) {
      for (const [a, b] of [[[i, -S, -S], [i, -S, S]], [[-S, -S, i], [S, -S, i]]] as [V3, V3][]) {
        const pa = P(a, v), pb = P(b, v);
        ctx.strokeStyle = i === 0 ? 'rgba(59,130,246,.35)' : 'rgba(31,55,102,.45)';
        ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      }
    }
    // cube edges
    ctx.strokeStyle = 'rgba(56,189,248,.18)';
    const cs: V3[] = []; for (let i = 0; i < 8; i++) cs.push([i & 1 ? S : -S, i & 2 ? S : -S, i & 4 ? S : -S]);
    for (const [a, b] of [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]]) {
      const pa = P(cs[a], v), pb = P(cs[b], v); ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    }
    // zero-change plane outline (y = 0)
    ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(142,163,199,.25)';
    const z0 = ([[-S, 0, -S], [S, 0, -S], [S, 0, S], [-S, 0, S]] as V3[]).map(p => P(p, v));
    ctx.beginPath(); z0.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);

    // points, far to near
    const proj3 = pts.map(pt => { const r = rot(pt.p, v); const s = proj(r, v); return { pt, x: s[0], y: s[1], f: s[2], d: r[2] }; });
    proj3.sort((a, b) => b.d - a.d);
    const f0 = proj([0, 0, 0], v)[2];
    hits.current = [];
    for (const q of proj3) {
      const rad = q.pt.r * (q.f / f0);
      const fog = Math.max(0.35, Math.min(1, 1 - (q.d + S) / (4 * S)));
      const hov = hoverSym.current === q.pt.row.symbol;
      if (q.pt.top || hov) {
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad * 3.2);
        g.addColorStop(0, rgba(q.pt.c, 1, 0.55)); g.addColorStop(1, rgba(q.pt.c, 1, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, rad * 3.2, 0, Math.PI * 2); ctx.fill();
      }
      const body = ctx.createRadialGradient(q.x - rad * 0.35, q.y - rad * 0.35, rad * 0.1, q.x, q.y, rad);
      body.addColorStop(0, rgba(q.pt.c, 1.35, fog)); body.addColorStop(1, rgba(q.pt.c, 0.7, fog));
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, Math.PI * 2); ctx.fill();
      if (hov) { ctx.strokeStyle = '#e8f0ff'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
      hits.current.push({ x: q.x, y: q.y, r: rad, d: q.d, row: q.pt.row });
    }
    // labels for the strongest names
    for (const q of proj3) if (q.pt.top) label(ctx, q.pt.row.symbol, q.x + 9, q.y - 9, rgba(q.pt.c, 1.2), 'left', 10.5);

    // axis labels
    const ax = (p: V3, t: string, c = '#b4c3df', al: CanvasTextAlign = 'center') => { const s = P(p, v); label(ctx, t, s[0], s[1], c, al, 11, 600); };
    ax([S + 0.6, -S, 0], 'Bullish →', '#34d399'); ax([-S - 0.6, -S, 0], '← Bearish', '#f87171');
    ax([-S, S + 0.5, -S], 'Day change +5%'); ax([-S, -S - 0.5, -S], '−5%');
    ax([S, -S, S + 0.7], 'Higher relative volume'); ax([S, -S, -S - 0.7], 'Lower relative volume');
  }, [pts], {
    auto: true,
    onHover: (x, y) => {
      const h = pick(x, y);
      const sym = h?.row.symbol ?? null;
      if (sym !== hoverSym.current) { hoverSym.current = sym; invalidate(); }
      setTip(h ? { x: h.x, y: h.y, row: h.row } : null);
      if (canvasRef.current) canvasRef.current.style.cursor = h ? 'pointer' : 'grab';
    },
    onLeave: () => { hoverSym.current = null; setTip(null); invalidate(); },
    onClick: (x, y) => { const h = pick(x, y); if (h) router.push(`/chart/${encodeURIComponent(h.row.symbol)}?tf=${tf}`); }
  });

  const r = tip?.row;
  return (
    <div className="scene3d">
      <div ref={wrapRef} className="scene3d-stage" style={{ height: `min(${height}px, 72vh)` }}>
        <canvas ref={canvasRef} tabIndex={0} aria-label={`Three-dimensional map of ${rows.length} active NSE F&O stocks. Use the arrow keys to rotate.`} role="img" />
        {r && tip && (
          <div className="tip3d" style={{
            left: Math.max(8, Math.min(tip.x + 14, (wrapRef.current?.clientWidth ?? 256) - 256)),
            top: Math.max(8, Math.min(tip.y + 14, (wrapRef.current?.clientHeight ?? 160) - 140))
          }}>
            <b>{r.symbol}</b> <span className="mono">{f2(r.ltp)}</span> <span className={`mono ${(r.changePct ?? 0) >= 0 ? 'bull' : 'bear'}`}>{pct(r.changePct)}</span>
            <div className="dim">{r.choppy ? 'Range-bound' : r.bias} · Score {r.score} · Relative volume {r.rvol.toFixed(2)}×</div>
            {r.zone && <div className="dim">Order block {f2(r.zone.bottom)}–{f2(r.zone.top)}</div>}
            <div className="grad" style={{ fontWeight: 700 }}>View chart →</div>
          </div>
        )}
      </div>
      <Controls3D zoomBy={zoomBy} reset={reset} hint="Drag to rotate · select a point to view its chart" />
    </div>
  );
}
