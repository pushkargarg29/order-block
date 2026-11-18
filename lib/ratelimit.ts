import { createHash } from 'node:crypto';

export class BudgetError extends Error {
  constructor(readonly bucket: string, readonly retryAfterMs: number) {
    super('The market-data provider rate limit has been reached. Please retry after the cooldown.');
    this.name = 'BudgetError';
  }
}

type Bucket = { ts: number[] };
type Decision = { allowed: boolean; retryAfterMs: number };
const localBuckets = new Map<string, Bucket>();
const localRequestCounts = new Map<string, { count: number; reset: number }>();
const LIMITS = { perSec: 20, perMin: 450, per30: 1850 };

function localAcquire(name: string, now: number): Decision {
  const bucket = localBuckets.get(name) ?? { ts: [] };
  localBuckets.set(name, bucket);
  while (bucket.ts.length && now - bucket.ts[0] > 1800000) bucket.ts.shift();
  if (bucket.ts.length >= LIMITS.per30) return { allowed: false, retryAfterMs: bucket.ts[0] + 1800001 - now };
  let perMin = 0, perSec = 0;
  for (let i = bucket.ts.length - 1; i >= 0; i--) {
    const age = now - bucket.ts[i];
    if (age > 60000) break;
    perMin++;
    if (age <= 1000) perSec++;
  }
  if (perMin >= LIMITS.perMin) return { allowed: false, retryAfterMs: bucket.ts[bucket.ts.length - perMin] + 60001 - now };
  if (perSec >= LIMITS.perSec) return { allowed: false, retryAfterMs: bucket.ts[bucket.ts.length - perSec] + 1001 - now };
  bucket.ts.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

export async function acquire(name: string, maxWaitMs = 45000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const now = Date.now();
    const decision = localAcquire(name, now);
    if (decision.allowed) return;
    const elapsed = Date.now() - start;
    if (decision.retryAfterMs > maxWaitMs - elapsed) throw new BudgetError(name, decision.retryAfterMs);
    await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(decision.retryAfterMs, 25), 1000)));
  }
}

export async function consumeRequestLimit(scope: string, identity: string, limit: number, windowMs = 60000): Promise<Decision> {
  const hash = createHash('sha256').update(identity).digest('hex');
  const key = `stoclio:request:${scope}:${hash}`;
  const now = Date.now();
  let bucket = localRequestCounts.get(key);
  if (!bucket || bucket.reset <= now) {
    bucket = { count: 0, reset: now + windowMs };
    localRequestCounts.set(key, bucket);
  }
  bucket.count++;
  if (localRequestCounts.size > 5000) {
    localRequestCounts.forEach((value, cacheKey) => {
      if (value.reset <= now) localRequestCounts.delete(cacheKey);
    });
  }
  return { allowed: bucket.count <= limit, retryAfterMs: Math.max(0, bucket.reset - now) };
}

export function budgetLeft(name: string): number {
  const bucket = localBuckets.get(name);
  if (!bucket) return LIMITS.per30;
  const now = Date.now();
  return LIMITS.per30 - bucket.ts.filter(timestamp => now - timestamp <= 1800000).length;
}
