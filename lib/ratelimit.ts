/**
 * Upstox enforces per-API, per-user limits: 50/s, 500/min, 2000/30min (standard APIs).
 * This limiter keeps each bucket safely below those numbers. It is per server instance —
 * keep Vercel concurrency modest or use one region (default).
 */
export class BudgetError extends Error { constructor(b: string) { super('Stoclio is busy refreshing market data. Please retry in a minute.'); this.name = `BudgetError:${b}`; } }

type Bucket = { ts: number[] };
const buckets = new Map<string, Bucket>();
const LIMITS = { perSec: 20, perMin: 450, per30: 1850 };

export async function acquire(name: string, maxWaitMs = 45000): Promise<void> {
  const b = buckets.get(name) ?? { ts: [] }; buckets.set(name, b);
  const start = Date.now();
  for (;;) {
    const now = Date.now();
    while (b.ts.length && now - b.ts[0] > 1800000) b.ts.shift();
    if (b.ts.length >= LIMITS.per30) throw new BudgetError(name);
    let lastMin = 0, lastSec = 0;
    for (let i = b.ts.length - 1; i >= 0; i--) { const d = now - b.ts[i]; if (d > 60000) break; lastMin++; if (d <= 1000) lastSec++; }
    if (lastSec < LIMITS.perSec && lastMin < LIMITS.perMin) { b.ts.push(now); return; }
    if (Date.now() - start > maxWaitMs) throw new BudgetError(name);
    await new Promise(r => setTimeout(r, lastMin >= LIMITS.perMin ? 1000 : 130));
  }
}
export function budgetLeft(name: string): number {
  const b = buckets.get(name); if (!b) return LIMITS.per30;
  const now = Date.now(); return LIMITS.per30 - b.ts.filter(t => now - t <= 1800000).length;
}
