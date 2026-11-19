import assert from 'node:assert/strict';
import test from 'node:test';
import { availabilityLabel, coverageLabel } from '../lib/scan-health';

test('coverage diagnostics distinguish missing data from zero coverage', () => {
  assert.equal(coverageLabel(undefined), 'Not reported');
  assert.equal(coverageLabel(Number.NaN), 'Not reported');
  assert.equal(coverageLabel(0), '0.0%');
  assert.equal(coverageLabel(0.875), '87.5%');
});

test('enrichment diagnostics distinguish unrequested data from unavailable requests', () => {
  assert.equal(availabilityLabel(0, 0), 'Not requested');
  assert.equal(availabilityLabel(0, 12), '0/12');
  assert.equal(availabilityLabel(9, 12), '9/12');
  assert.equal(availabilityLabel(Number.NaN, 12), 'Not reported');
});
