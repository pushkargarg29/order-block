import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyBearerSecret } from '../lib/cron-auth';
import {
  createMethodologySession, verifyMethodologyPin, verifyMethodologySession
} from '../lib/methodology-auth';

test('cron authorization requires a bearer token matching the configured secret', () => {
  assert.equal(verifyBearerSecret('Bearer production-secret', 'production-secret'), true);
  assert.equal(verifyBearerSecret(null, 'production-secret'), false);
  assert.equal(verifyBearerSecret('production-secret', 'production-secret'), false);
  assert.equal(verifyBearerSecret('Bearer wrong-secret', 'production-secret'), false);
});

test('methodology PIN sessions are signed, time-limited, and reject tampering', () => {
  const previousPin = process.env.METHODOLOGY_PIN;
  const previousSecret = process.env.CRON_SECRET;
  process.env.METHODOLOGY_PIN = '8472';
  process.env.CRON_SECRET = 'test-secret-with-more-than-thirty-two-characters';
  try {
    assert.equal(verifyMethodologyPin('8472'), true);
    assert.equal(verifyMethodologyPin('0000'), false);
    const now = Date.now();
    const token = createMethodologySession(now);
    assert.equal(verifyMethodologySession(token, now), true);
    assert.equal(verifyMethodologySession(token, now + 12 * 60 * 60 * 1000), false);
    assert.equal(verifyMethodologySession(`${token}x`, now), false);
  } finally {
    if (previousPin === undefined) delete process.env.METHODOLOGY_PIN;
    else process.env.METHODOLOGY_PIN = previousPin;
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});
