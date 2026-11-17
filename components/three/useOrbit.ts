'use client';
import { useCallback, useEffect, useRef } from 'react';
import type { View } from './engine';

type Opts = {
  yaw?: number; pitch?: number; zoom?: number; auto?: boolean;
  onHover?: (x: number, y: number) => void; onLeave?: () => void; onClick?: (x: number, y: number) => void;
};

/**
 * Orbit controls + render loop for a Canvas2D 3D scene.
 * Drag to rotate (touch keeps vertical page scroll), arrow keys rotate, auto-rotate when idle,
 * pauses when off-screen and respects prefers-reduced-motion.
 */
export function useOrbit(render: (ctx: CanvasRenderingContext2D, v: View) => void, deps: unknown[], o: Opts = {}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const view = useRef<View>({ yaw: o.yaw ?? -0.6, pitch: o.pitch ?? -0.38, zoom: o.zoom ?? 1, w: 600, h: 400 });
  const home = useRef({ ...view.current });
  const renderRef = useRef(render); renderRef.current = render;
  const optsRef = useRef(o); optsRef.current = o;
  const dirty = useRef(true);
  const lastInteract = useRef(0);

  const invalidate = useCallback(() => { dirty.current = true; }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { dirty.current = true; }, deps);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = true, raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = wrap.clientWidth, h = wrap.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view.current.w = w; view.current.h = h; dirty.current = true;
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) dirty.current = true; });
    io.observe(wrap);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      if (optsRef.current.auto && !reduced && Date.now() - lastInteract.current > 3000) { view.current.yaw += 0.0022; dirty.current = true; }
      if (!dirty.current) return;
      dirty.current = false;
      ctx.clearRect(0, 0, view.current.w, view.current.h);
      renderRef.current(ctx, view.current);
    };
    raf = requestAnimationFrame(tick);

    let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean; id: number } | null = null;
    const pos = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, yaw: view.current.yaw, pitch: view.current.pitch, moved: false, id: e.pointerId };
      lastInteract.current = Date.now();
    };
    const move = (e: PointerEvent) => {
      if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ } }
        if (drag.moved) {
          view.current.yaw = drag.yaw + dx * 0.008;
          if (e.pointerType === 'mouse') view.current.pitch = Math.max(-1.35, Math.min(0.25, drag.pitch + dy * 0.006));
          lastInteract.current = Date.now(); dirty.current = true;
          optsRef.current.onLeave?.();
          return;
        }
      }
      const [x, y] = pos(e); optsRef.current.onHover?.(x, y);
    };
    const up = (e: PointerEvent) => {
      if (drag && !drag.moved && drag.id === e.pointerId) { const [x, y] = pos(e); optsRef.current.onClick?.(x, y); }
      drag = null;
    };
    const leave = () => { if (!drag) optsRef.current.onLeave?.(); };
    const key = (e: KeyboardEvent) => {
      const step = 0.12;
      if (e.key === 'ArrowLeft') view.current.yaw -= step;
      else if (e.key === 'ArrowRight') view.current.yaw += step;
      else if (e.key === 'ArrowUp') view.current.pitch = Math.max(-1.35, view.current.pitch - step);
      else if (e.key === 'ArrowDown') view.current.pitch = Math.min(0.25, view.current.pitch + step);
      else return;
      e.preventDefault(); lastInteract.current = Date.now(); dirty.current = true;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('keydown', key);
    };
  }, []);

  const zoomBy = useCallback((k: number) => { view.current.zoom = Math.max(0.6, Math.min(2.4, view.current.zoom * k)); lastInteract.current = Date.now(); dirty.current = true; }, []);
  const reset = useCallback(() => { const { w, h } = view.current; view.current = { ...home.current, w, h }; lastInteract.current = 0; dirty.current = true; }, []);
  return { wrapRef, canvasRef, view, invalidate, zoomBy, reset };
}
