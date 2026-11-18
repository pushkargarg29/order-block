import type { TradePlan } from './types';

export type PlanReadiness = 'awaiting-entry' | 'entry-level-reached' | 'invalidation-breached' | 'stop-breached';

export function planReadiness(plan: Pick<NonNullable<TradePlan>, 'side' | 'entry' | 'sl' | 'invalidation'>, ltp: number): PlanReadiness {
  const bull = plan.side === 'bull';
  if (bull ? ltp <= plan.sl : ltp >= plan.sl) return 'stop-breached';
  if (bull ? ltp < plan.invalidation : ltp > plan.invalidation) return 'invalidation-breached';
  if (bull ? ltp <= plan.entry : ltp >= plan.entry) return 'entry-level-reached';
  return 'awaiting-entry';
}

export function planStatusMessage(plan: Pick<NonNullable<TradePlan>, 'side' | 'entry' | 'sl' | 'invalidation'>, ltp: number): string {
  const state = planReadiness(plan, ltp);
  if (state === 'stop-breached') return 'Stop level breached — do not enter';
  if (state === 'invalidation-breached') return 'Plan invalidated — do not enter';
  if (state === 'entry-level-reached') return 'Price at/through entry';
  return `Await entry · ${(Math.abs(ltp - plan.entry) / ltp * 100).toFixed(2)}% away`;
}
