import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { consumeRequestLimit } from '../lib/ratelimit';

test('request limits isolate identities and reject requests after the configured count', async () => {
  const identity = randomUUID();
  assert.equal((await consumeRequestLimit('test', identity, 2)).allowed, true);
  assert.equal((await consumeRequestLimit('test', identity, 2)).allowed, true);
  assert.equal((await consumeRequestLimit('test', identity, 2)).allowed, false);
  assert.equal((await consumeRequestLimit('test', `${identity}-other`, 2)).allowed, true);
});

test('production request limiting works without external service configuration', async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
  };
  const setEnv = (name: string, value: string | undefined) => {
    if (value === undefined) Reflect.deleteProperty(process.env, name);
    else Reflect.set(process.env, name, value);
  };
  setEnv('NODE_ENV', 'production');
  try {
    const identity = randomUUID();
    assert.equal((await consumeRequestLimit('test', identity, 1)).allowed, true);
    assert.equal((await consumeRequestLimit('test', identity, 1)).allowed, false);
  } finally {
    setEnv('NODE_ENV', previous.nodeEnv);
  }
});
