'use client';
import { useEffect, useRef, useState } from 'react';
import type { Analysis, Candle, OptionWalls } from '@/lib/types';
import { fmtIST } from '@/lib/time';

type Props = { candles: Candle[]; a: Analysis | null; showFvg: boolean; showEma: boolean; showPlan: boolean; daily: boolean; walls?: OptionWalls | null; showWalls?: boolean; initialCount?: number; interactive?: boolean; height?: number; compact?: boolean };

export default function CandleChart({ candles, a, showFvg, showEma, showPlan, daily, walls, showWalls = true, initialCount = 120, interactive = true, height, compact = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ count: initialCount, offset: 0 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; off: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = cv.current; if (!canvas || !candles.length) return;
    const dpr = window.devicePixelRatio || 1;
    const { w: W, h: Ht } = size;
    canvas.width = W * dpr; canvas.height = Ht * dpr;
    const ctx = canvas.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, Ht);
    const n = candles.length;
    const count = Math.min(view.count, n);
    const end = Math.max(count, n - view.offset);
    const start = end - count;
    const vis = candles.slice(start, end);
    const AX = 72, BT = 24, plotW = W - AX, plotH = Ht - BT;
    let hi = Math.max(...vis.map(c => c.h)), lo = Math.min(...vis.map(c => c.l));
    const pad = (hi - lo) * 0.08 || 1; hi += pad; lo -= pad;
    const y = (p: number) => ((hi - p) / (hi - lo)) * plotH;
    const cw = plotW / count;
    const x = (i: number) => (i - start + 0.5) * cw;
    const idx = new Map<number, number>(); candles.forEach((c, i) => idx.set(c.t, i));

    // grid
    ctx.strokeStyle = 'rgba(31,55,102,.35)'; ctx.lineWidth = 1; ctx.font = '12px Arial,sans-serif'; ctx.fillStyle = '#93a6c8';
    for (let g = 0; g <= 6; g++) { const yy = (plotH / 6) * g; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke(); ctx.fillText((hi - ((hi - lo) / 6) * g).toFixed(2), plotW + 6, yy + 4); }
    const step = Math.max(1, Math.round(count / (compact ? 4 : 7)));
    for (let i = start; i < end; i += step) ctx.fillText(fmtIST(candles[i].t, true).replace(',', ''), x(i) - 28, Ht - 7);

    if (a) {
      // order blocks
      for (const z of (compact ? (a.activeZone ? [a.activeZone] : []) : a.zones)) {
        const s = idx.get(z.startT); if (s == null) continue;
        const e = z.endT != null ? (idx.get(z.endT) ?? n - 1) : end + 1;
        if (e < start) continue;
        const x0 = Math.max(0, x(s) - cw / 2), x1 = Math.min(plotW, x(Math.min(e, end)) + cw / 2);
        const bull = z.side === 'bull';
        const alpha = z.invalidated ? 0.06 : 0.12 + z.strength * 0.18;
        ctx.fillStyle = bull ? `rgba(56,189,248,${alpha})` : `rgba(248,113,113,${alpha})`;
        ctx.fillRect(x0, y(z.top), x1 - x0, y(z.bottom) - y(z.top));
        ctx.strokeStyle = z.invalidated ? 'rgba(91,111,148,.5)' : bull ? '#38bdf8' : '#f87171';
        ctx.setLineDash(z.invalidated ? [3, 3] : []); ctx.strokeRect(x0, y(z.top), x1 - x0, y(z.bottom) - y(z.top)); ctx.setLineDash([]);
        if (!compact && !z.invalidated) { ctx.fillStyle = bull ? '#7dd3fc' : '#fca5a5'; ctx.font = 'bold 11px Arial,sans-serif'; ctx.fillText(`${bull ? 'Bull' : 'Bear'} OB ${z.bottom.toFixed(2)}–${z.top.toFixed(2)} · ${(z.strength * 100).toFixed(0)}%`, x0 + 4, bull ? y(z.bottom) + 13 : y(z.top) - 5); }
      }
      if (showFvg) for (const f of a.fvgs) {
        const s = idx.get(f.t); if (s == null || s >= end) continue;
        const x0 = Math.max(0, x(s)); ctx.fillStyle = f.side === 'bull' ? 'rgba(59,130,246,.10)' : 'rgba(251,146,60,.10)';
        ctx.fillRect(x0, y(f.top), plotW - x0, y(f.bottom) - y(f.top));
      }
      const hline = (p: number | null, col: string, label: string, dash: number[]) => {
        if (p == null || p > hi || p < lo) return;
        ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, y(p)); ctx.lineTo(plotW, y(p)); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
        if (!compact) { ctx.fillStyle = col; ctx.font = 'bold 11px Arial,sans-serif'; ctx.fillText(`${label} ${p.toFixed(2)}`, 6, y(p) - 4); }
      };
      if (!compact) {
        hline(a.resistance, '#b4c3df', 'Resistance', [5, 5]);
        hline(a.support, '#b4c3df', 'Support', [5, 5]);
        for (const l of a.liquidity) hline(l.price, 'rgba(251,191,36,.55)', `${l.side === 'buy' ? 'BSL' : 'SSL'}${l.count > 1 ? ` ×${l.count}` : ''}`, [2, 4]);
        hline(a.liquidityLevel, '#fbbf24', 'Liquidity', [8, 5]);
      }
      if (!compact && showWalls && walls) {
        hline(walls.callWall, 'rgba(248,113,113,.85)', 'Call OI wall', [10, 4]);
        hline(walls.putWall, 'rgba(52,211,153,.85)', 'Put OI wall', [10, 4]);
        hline(walls.maxPain, 'rgba(167,139,250,.8)', 'Max pain', [2, 6]);
      }
      if (!compact && showPlan && a.plan) { hline(a.plan.entry, '#60a5fa', 'Entry', []); hline(a.plan.sl, '#f87171', 'SL', [4, 3]); a.plan.tps.slice(1).forEach((t, k) => hline(t.price, '#34d399', `TP${k + 2}`, [4, 3])); hline(a.plan.target, '#34d399', 'TP1', [4, 3]); }
      if (!compact && showEma) {
        const line = (s: (number | null)[], col: string) => { ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); let m = false; for (let i = start; i < end; i++) { const v = s[i]; if (v == null) continue; m ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)); m = true; } ctx.stroke(); ctx.lineWidth = 1; };
        line(a.ema20Series, 'rgba(96,165,250,.9)'); line(a.ema50Series, 'rgba(167,139,250,.8)');
      }
      // structure events
      if (!compact) {
        ctx.font = 'bold 10px Arial,sans-serif';
        for (const ev of a.events) {
          const i = idx.get(ev.t), p = idx.get(ev.pivotT); if (i == null || p == null || i < start) continue;
          ctx.strokeStyle = ev.dir === 'bull' ? 'rgba(52,211,153,.7)' : 'rgba(248,113,113,.7)'; ctx.setLineDash([2, 2]);
          ctx.beginPath(); ctx.moveTo(Math.max(0, x(p)), y(ev.level)); ctx.lineTo(x(i), y(ev.level)); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = ctx.strokeStyle; ctx.fillText(ev.kind, (Math.max(0, x(p)) + x(i)) / 2 - 12, y(ev.level) + (ev.dir === 'bull' ? -4 : 12));
        }
        for (const sw of a.sweeps) {
          const i = idx.get(sw.t); if (i == null || i < start) continue;
          ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(x(i), y(sw.price), 4.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // candles
    for (let i = start; i < end; i++) {
      const c = candles[i]; const up = c.c >= c.o;
      const col = up ? '#34d399' : '#f87171';
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x(i), y(c.h)); ctx.lineTo(x(i), y(c.l)); ctx.stroke();
      const bw = Math.max(1, cw * 0.66);
      ctx.fillRect(x(i) - bw / 2, y(Math.max(c.o, c.c)), bw, Math.max(1, Math.abs(y(c.o) - y(c.c))));
    }
    // last price
    const lp = candles[n - 1].c;
    if (lp <= hi && lp >= lo) {
      ctx.strokeStyle = '#38bdf8'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(0, y(lp)); ctx.lineTo(plotW, y(lp)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(plotW, y(lp) - 9, AX, 18); ctx.fillStyle = '#04101f'; ctx.font = 'bold 12px Arial,sans-serif'; ctx.fillText(lp.toFixed(2), plotW + 6, y(lp) + 4);
    }
    // crosshair
    if (hover && hover.x < plotW) {
      const i = Math.min(end - 1, Math.max(start, Math.floor(hover.x / cw) + start));
      const c = candles[i];
      ctx.strokeStyle = 'rgba(142,163,199,.4)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x(i), 0); ctx.lineTo(x(i), plotH); ctx.moveTo(0, hover.y); ctx.lineTo(plotW, hover.y); ctx.stroke(); ctx.setLineDash([]);
      const p = hi - (hover.y / plotH) * (hi - lo);
      ctx.fillStyle = '#1f3766'; ctx.fillRect(plotW, hover.y - 9, AX, 18); ctx.fillStyle = '#e8f0ff'; ctx.font = '12px Arial,sans-serif'; ctx.fillText(p.toFixed(2), plotW + 6, hover.y + 4);
      const txt = `${fmtIST(c.t, true)}  O ${c.o.toFixed(2)}  H ${c.h.toFixed(2)}  L ${c.l.toFixed(2)}  C ${c.c.toFixed(2)}  V ${c.v.toLocaleString('en-IN')}`;
      ctx.fillStyle = 'rgba(10,22,48,.92)'; const tw = ctx.measureText(txt).width + 16; ctx.fillRect(8, 8, tw, 22);
      ctx.fillStyle = '#e8f0ff'; ctx.fillText(txt, 16, 23);
    }
  }, [candles, a, view, hover, size, showFvg, showEma, showPlan, daily, walls, showWalls, compact]);

  useEffect(() => {
    const el = cv.current; if (!el) return;
    if (!interactive) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setView(v => ({ ...v, count: Math.round(Math.min(Math.max(20, v.count * (e.deltaY > 0 ? 1.12 : 0.89)), candles.length || 20)) })); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [candles.length, interactive]);

  const pos = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  return (
    <div ref={wrap} className={`chart-wrap${compact ? ' compact-chart' : ''}`} style={height ? { height } : undefined}>
      <canvas ref={cv}
        onPointerDown={e => { if (!interactive) return; (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, off: view.offset }; }}
        onPointerMove={e => {
          if (interactive) setHover(pos(e));
          if (interactive && drag.current) {
            const cw = (size.w - 72) / Math.min(view.count, candles.length);
            const off = Math.round(drag.current.off + (e.clientX - drag.current.x) / cw);
            setView(v => ({ ...v, offset: Math.max(0, Math.min(candles.length - v.count, off)) }));
          }
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerLeave={() => { setHover(null); drag.current = null; }}
        onDoubleClick={() => setView({ count: initialCount, offset: 0 })}
        aria-label="Order block candlestick chart" role="img" />
    </div>
  );
}
