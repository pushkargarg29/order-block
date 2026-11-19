import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyBearerSecret } from '../lib/cron-auth';
import { isMethodologyAuthConfigured, verifyMethodologyPin } from '../lib/methodology-auth';

test('cron authorization requires a bearer token matching the configured secret', () => {
  assert.equal(verifyBearerSecret('Bearer production-secret', 'production-secret'), true);
  assert.equal(verifyBearerSecret(null, 'production-secret'), false);
  assert.equal(verifyBearerSecret('production-secret', 'production-secret'), false);
  assert.equal(verifyBearerSecret('Bearer wrong-secret', 'production-secret'), false);
});

test('methodology PIN verification uses the configured four-digit PIN', () => {
  const previousPin = process.env.METHODOLOGY_PIN;
  process.env.METHODOLOGY_PIN = '8472';
  try {
    assert.equal(verifyMethodologyPin('8472'), true);
    assert.equal(verifyMethodologyPin('0000'), false);
  } finally {
    if (previousPin === undefined) delete process.env.METHODOLOGY_PIN;
    else process.env.METHODOLOGY_PIN = previousPin;
  }
});

test('methodology access requires only a valid four-digit PIN', () => {
  const previousPin = process.env.METHODOLOGY_PIN;
  try {
    process.env.METHODOLOGY_PIN = '8472';
    assert.equal(isMethodologyAuthConfigured(), true);
    process.env.METHODOLOGY_PIN = 'invalid';
    assert.equal(isMethodologyAuthConfigured(), false);
  } finally {
    if (previousPin === undefined) delete process.env.METHODOLOGY_PIN;
    else process.env.METHODOLOGY_PIN = previousPin;
  }
});
