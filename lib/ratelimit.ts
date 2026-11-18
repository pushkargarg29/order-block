import { createHash, randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';

export class BudgetError extends Error {
  constructor(readonly bucket: string, readonly retryAfterMs: number) {
    super('The market-data provider rate limit has been reached. Please retry after the cooldown.');
    this.name = 'BudgetError';
  }
}

export class RateLimitUnavailable extends Error {
  constructor(message = 'Shared request protection is temporarily unavailable.') {
    super(message);
    this.name = 'RateLimitUnavailable';
  }
}

type Bucket = { ts: number[] };
type Decision = { allowed: boolean; retryAfterMs: number };
const localBuckets = new Map<string, Bucket>();
const localRequestCounts = new Map<string, { count: number; reset: number }>();
const LIMITS = { perSec: 20, perMin: 450, per30: 1850 };
let redisClient: Redis | null = null;

const QUOTA_SCRIPT = `
local now = tonumber(ARGV[1])
local member = ARGV[2]
local key = KEYS[1]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - 1800000)
local wait = 0
local function check(window, limit)
  local lower = '(' .. tostring(now - window)
  local count = redis.call('ZCOUNT', key, lower, '+inf')
  if count >= limit then
    local oldest = redis.call('ZRANGEBYSCORE', key, lower, '+inf', 'WITHSCORES', 'LIMIT', 0, 1)
    if oldest[2] then
      local delay = tonumber(oldest[2]) + window + 1 - now
      if delay > wait then wait = delay end
    end
  end
end
check(1000, tonumber(ARGV[3]))
check(60000, tonumber(ARGV[4]))
check(1800000, tonumber(ARGV[5]))
if wait > 0 then return {0, math.ceil(wait)} end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, 1801000)
return {1, 0}
`;

const REQUEST_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1])) end
return {count, redis.call('PTTL', KEYS[1])}
`;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  redisClient ??= new Redis({ url, token });
  return redisClient;
}

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
  const redis = getRedis();
  for (;;) {
    const now = Date.now();
    let decision: Decision;
    if (redis) {
      const key = `stoclio:upstream:${name}`;
      const args = [String(now), `${now}:${randomUUID()}`, String(LIMITS.perSec), String(LIMITS.perMin), String(LIMITS.per30)];
      try {
        const response = await redis.eval<string[], [number, number]>(QUOTA_SCRIPT, [key], args);
        const [allowed, retryAfterMs] = response;
        decision = { allowed: Number(allowed) === 1, retryAfterMs: Number(retryAfterMs) };
      } catch {
        console.error('[stoclio] shared upstream limiter unavailable; using local fallback');
        decision = localAcquire(name, now);
      }
    } else {
      decision = localAcquire(name, now);
    }
    if (decision.allowed) return;
    const elapsed = Date.now() - start;
    if (decision.retryAfterMs > maxWaitMs - elapsed) throw new BudgetError(name, decision.retryAfterMs);
    await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(decision.retryAfterMs, 25), 1000)));
  }
}

export async function consumeRequestLimit(scope: string, identity: string, limit: number, windowMs = 60000): Promise<Decision> {
  const hash = createHash('sha256').update(identity).digest('hex');
  const key = `stoclio:request:${scope}:${hash}`;
  const redis = getRedis();
  if (redis) {
    try {
      const [count, ttl] = await redis.eval<string[], [number, number]>(REQUEST_SCRIPT, [key], [String(windowMs)]);
      return { allowed: Number(count) <= limit, retryAfterMs: Math.max(0, Number(ttl)) };
    } catch {
      console.error('[stoclio] shared request limiter unavailable; using local fallback');
    }
  }
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
