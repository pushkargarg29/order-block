/**
 * Logistic probability model: P(zone reacts +1R before stop | price touches zone).
 * Weights are fitted offline by `npm run backtest` (scripts/backtest.ts) and stored in model-weights.json.
 * Until fitted, a hand-set prior is used; its output is not a calibrated probability.
 */
import weightsFile from './model-weights.json';
import { sigmoid } from './indicators';

export const FEATURE_NAMES = [
  'biasAligned', 'efficiency', 'displacement', 'zoneRvol', 'fvg', 'zoneAge', 'rvolNow', 'sweep', 'htfAlign', 'rsiAligned', 'zoneWidth'
] as const;

export type FittedModel = {
  fitted: boolean; trainedAt: string | null; samples: number;
  means: number[]; stds: number[]; w: number[]; b: number;
  oos?: { auc: number; brier: number; baseRate: number; samples: number } | null;
  stats?: Record<string, number> | null;
};

const PRIOR: FittedModel = {
  fitted: false, trainedAt: null, samples: 0,
  means: FEATURE_NAMES.map(() => 0), stds: FEATURE_NAMES.map(() => 1),
  w: [0.5, 0.3, 0.25, 0.15, 0.12, -0.15, 0.1, 0.2, 0.3, -0.05, -0.15], b: -0.1
};

type StoredModel = Omit<FittedModel, 'fitted'> & { fitted?: boolean; calibrated?: boolean };
const models = ((weightsFile as { models?: Record<string, StoredModel> }).models) ?? {};

export function getModel(tf: string): FittedModel {
  const m = models[tf];
  const validArray = (value: unknown, length: number) =>
    Array.isArray(value) && value.length === length && value.every(v => typeof v === 'number' && Number.isFinite(v));
  if (
    m &&
    validArray(m.means, FEATURE_NAMES.length) &&
    validArray(m.stds, FEATURE_NAMES.length) &&
    validArray(m.w, FEATURE_NAMES.length) &&
    typeof m.b === 'number' &&
    Number.isFinite(m.b)
  ) {
    return { ...m, fitted: m.fitted ?? m.calibrated ?? false };
  }
  return PRIOR;
}

export function predict(tf: string, x: number[]): number {
  const m = getModel(tf);
  let z = m.b;
  for (let j = 0; j < m.w.length; j++) z += m.w[j] * ((x[j] - m.means[j]) / (m.stds[j] || 1));
  return sigmoid(z);
}

export function modelInfo(tf: string) {
  const m = getModel(tf);
  return { fitted: m.fitted, trainedAt: m.trainedAt, samples: m.samples, oos: m.oos ?? null };
}
