/** L2-regularised logistic regression + evaluation (AUC, Brier, reliability). Pure TS, no deps. */
import { sigmoid, mean } from './indicators';
import type { FittedModel } from './model';

export function fitLogistic(X: number[][], y: number[], opts: { l2?: number; iters?: number; lr?: number } = {}): Omit<FittedModel, 'fitted' | 'trainedAt' | 'samples'> {
  const n = X.length, p = X[0]?.length ?? 0;
  const l2 = opts.l2 ?? 0.01, iters = opts.iters ?? 3000, lr = opts.lr ?? 0.1;
  const means = Array.from({ length: p }, (_, j) => mean(X.map(r => r[j])));
  const stds = Array.from({ length: p }, (_, j) => Math.sqrt(mean(X.map(r => (r[j] - means[j]) ** 2))) || 1);
  const Z = X.map(r => r.map((v, j) => (v - means[j]) / stds[j]));
  const w = new Array(p).fill(0);
  let b = Math.log((mean(y) + 1e-6) / (1 - mean(y) + 1e-6));
  // Adam
  const mw = new Array(p).fill(0), vw = new Array(p).fill(0); let mb = 0, vb = 0;
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  for (let it = 1; it <= iters; it++) {
    const gw = new Array(p).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b; for (let j = 0; j < p; j++) z += w[j] * Z[i][j];
      const e = sigmoid(z) - y[i];
      gb += e; for (let j = 0; j < p; j++) gw[j] += e * Z[i][j];
    }
    gb /= n;
    for (let j = 0; j < p; j++) {
      gw[j] = gw[j] / n + l2 * w[j];
      mw[j] = b1 * mw[j] + (1 - b1) * gw[j]; vw[j] = b2 * vw[j] + (1 - b2) * gw[j] ** 2;
      w[j] -= lr * (mw[j] / (1 - b1 ** it)) / (Math.sqrt(vw[j] / (1 - b2 ** it)) + eps);
    }
    mb = b1 * mb + (1 - b1) * gb; vb = b2 * vb + (1 - b2) * gb ** 2;
    b -= lr * (mb / (1 - b1 ** it)) / (Math.sqrt(vb / (1 - b2 ** it)) + eps);
  }
  return { means, stds, w, b };
}

export function predictWith(m: { means: number[]; stds: number[]; w: number[]; b: number }, x: number[]): number {
  let z = m.b; for (let j = 0; j < m.w.length; j++) z += m.w[j] * ((x[j] - m.means[j]) / (m.stds[j] || 1));
  return sigmoid(z);
}

export function purgeOverlappingTrades<T extends { exitT: number }>(trades: T[], testStart: number): T[] {
  return trades.filter(trade => trade.exitT < testStart);
}

export function auc(p: number[], y: number[]): number {
  if (p.length !== y.length || p.length === 0 || p.some(value => !Number.isFinite(value)) || y.some(value => value !== 0 && value !== 1)) return 0.5;
  const idx = p.map((v, i) => i).sort((a, b) => p[a] - p[b]);
  let sumPos = 0, pos = 0;
  for (let start = 0; start < idx.length;) {
    let end = start + 1;
    while (end < idx.length && p[idx[end]] === p[idx[start]]) end++;
    const averageRank = ((start + 1) + end) / 2;
    for (let k = start; k < end; k++) {
      if (y[idx[k]] === 1) { sumPos += averageRank; pos++; }
    }
    start = end;
  }
  const neg = y.length - pos;
  return pos && neg ? (sumPos - (pos * (pos + 1)) / 2) / (pos * neg) : 0.5;
}

export const brier = (p: number[], y: number[]) => mean(p.map((v, i) => (v - y[i]) ** 2));

export const BUCKETS: [number, number][] = [[0, 0.3], [0.3, 0.4], [0.4, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 1.01]];
export function reliability(p: number[], y: number[]) {
  return BUCKETS.map(([a, b]) => {
    const ix = p.map((v, i) => i).filter(i => p[i] >= a && p[i] < b);
    return { bucket: `${Math.round(a * 100)}–${Math.min(100, Math.round(b * 100))}%`, n: ix.length,
      predicted: ix.length ? mean(ix.map(i => p[i])) : 0, actual: ix.length ? mean(ix.map(i => y[i])) : 0 };
  });
}
