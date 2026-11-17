/** Tiny dependency-free 3D engine for Canvas2D: orbit camera, perspective projection, shading. */
export type V3 = [number, number, number];
export type View = { yaw: number; pitch: number; zoom: number; w: number; h: number };
export const CAM_D = 24;

export function rot(p: V3, v: View): V3 {
  const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
  const x = p[0] * cy + p[2] * sy;
  const z0 = -p[0] * sy + p[2] * cy;
  return [x, p[1] * cp - z0 * sp, p[1] * sp + z0 * cp];
}

/** Rotated point -> [screenX, screenY, scale]. Camera sits at z = -CAM_D looking +z. */
export function proj(r: V3, v: View): [number, number, number] {
  const depth = Math.max(r[2] + CAM_D, 0.5);
  const f = (Math.min(v.w, v.h * 1.25) * 1.45 * v.zoom) / depth;
  return [v.w / 2 + r[0] * f, v.h / 2 - r[1] * f, f];
}

export const P = (p: V3, v: View) => proj(rot(p, v), v);

export function hexRgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
export const rgba = (c: [number, number, number], k = 1, a = 1) =>
  `rgba(${Math.round(Math.min(255, c[0] * k))},${Math.round(Math.min(255, c[1] * k))},${Math.round(Math.min(255, c[2] * k))},${a})`;

const LIGHT: V3 = (() => { const l: V3 = [-0.35, 0.75, -0.55]; const m = Math.hypot(...l); return [l[0] / m, l[1] / m, l[2] / m]; })();

export type Poly = { kind: 'poly'; pts: [number, number][]; depth: number; fill: string; stroke?: string };
export type Seg = { kind: 'seg'; a: [number, number]; b: [number, number]; depth: number; color: string; width: number; dash?: number[] };
export type Prim = Poly | Seg;

// corner index bits: x=1, y=2, z=4
const FACES: { idx: number[]; n: V3 }[] = [
  { idx: [0, 2, 6, 4], n: [-1, 0, 0] }, { idx: [1, 3, 7, 5], n: [1, 0, 0] },
  { idx: [0, 1, 5, 4], n: [0, -1, 0] }, { idx: [2, 3, 7, 6], n: [0, 1, 0] },
  { idx: [0, 1, 3, 2], n: [0, 0, -1] }, { idx: [4, 5, 7, 6], n: [0, 0, 1] }
];

/** Axis-aligned box -> visible, shaded faces (back-face culled). */
export function box(out: Prim[], min: V3, max: V3, v: View, color: [number, number, number], alpha = 1, stroke?: string) {
  const corners: V3[] = [];
  for (let i = 0; i < 8; i++) corners.push(rot([i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]], v));
  const scr = corners.map(c => proj(c, v));
  for (const f of FACES) {
    const n = rot(f.n, v);
    const c = f.idx.reduce<V3>((s, i) => [s[0] + corners[i][0] / 4, s[1] + corners[i][1] / 4, s[2] + corners[i][2] / 4], [0, 0, 0]);
    const toCam: V3 = [-c[0], -c[1], -CAM_D - c[2]];
    if (n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2] <= 0) continue;
    const light = 0.5 + 0.55 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    out.push({ kind: 'poly', pts: f.idx.map(i => [scr[i][0], scr[i][1]] as [number, number]), depth: c[2], fill: rgba(color, light, alpha), stroke });
  }
}

export function seg(out: Prim[], a: V3, b: V3, v: View, color: string, width = 1, dash?: number[]) {
  const ra = rot(a, v), rb = rot(b, v);
  const pa = proj(ra, v), pb = proj(rb, v);
  out.push({ kind: 'seg', a: [pa[0], pa[1]], b: [pb[0], pb[1]], depth: (ra[2] + rb[2]) / 2, color, width, dash });
}

/** Painter's algorithm: far to near. */
export function paint(ctx: CanvasRenderingContext2D, prims: Prim[]) {
  prims.sort((x, y) => y.depth - x.depth);
  for (const p of prims) {
    if (p.kind === 'poly') {
      ctx.beginPath(); ctx.moveTo(p.pts[0][0], p.pts[0][1]);
      for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0], p.pts[i][1]);
      ctx.closePath(); ctx.fillStyle = p.fill; ctx.fill();
      if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = 1; ctx.stroke(); }
    } else {
      ctx.strokeStyle = p.color; ctx.lineWidth = p.width; ctx.setLineDash(p.dash ?? []);
      ctx.beginPath(); ctx.moveTo(p.a[0], p.a[1]); ctx.lineTo(p.b[0], p.b[1]); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}

export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', size = 11, weight = 700) {
  ctx.font = `${weight} ${size}px Inter, system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(4,9,20,.72)';
  const w = ctx.measureText(text).width, x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.fillRect(x0 - 4, y - size / 2 - 3, w + 8, size + 6);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
