import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { consumeRequestLimit, RateLimitUnavailable } from '../lib/ratelimit';

test('request limits isolate identities and reject requests after the configured count', async () => {
  const identity = randomUUID();
  assert.equal((await consumeRequestLimit('test', identity, 2)).allowed, true);
  assert.equal((await consumeRequestLimit('test', identity, 2)).allowed, true);
  assert.equal((await consumeRequestLimit('test', identity, 2)).allowed, false);
  assert.equal((await consumeRequestLimit('test', `${identity}-other`, 2)).allowed, true);
});

test('production uses a local limiter fallback when shared rate limiting is not configured', async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  const setEnv = (name: string, value: string | undefined) => {
    if (value === undefined) Reflect.deleteProperty(process.env, name);
    else Reflect.set(process.env, name, value);
  };
  setEnv('NODE_ENV', 'production');
  setEnv('UPSTASH_REDIS_REST_URL', undefined);
  setEnv('UPSTASH_REDIS_REST_TOKEN', undefined);
  try {
    assert.equal((await consumeRequestLimit('test', randomUUID(), 1)).allowed, true);
  } finally {
    setEnv('NODE_ENV', previous.nodeEnv);
    setEnv('UPSTASH_REDIS_REST_URL', previous.url);
    setEnv('UPSTASH_REDIS_REST_TOKEN', previous.token);
  }
});
