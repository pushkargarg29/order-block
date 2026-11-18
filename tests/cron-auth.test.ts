import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyBearerSecret } from '../lib/cron-auth';

test('cron authorization requires a bearer token matching the configured secret', () => {
  assert.equal(verifyBearerSecret('Bearer production-secret', 'production-secret'), true);
  assert.equal(verifyBearerSecret(null, 'production-secret'), false);
  assert.equal(verifyBearerSecret('production-secret', 'production-secret'), false);
  assert.equal(verifyBearerSecret('Bearer wrong-secret', 'production-secret'), false);
});
