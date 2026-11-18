import assert from 'node:assert/strict';
import test from 'node:test';
import { auc, purgeOverlappingTrades } from '../lib/fit';

test('walk-forward training excludes trades that overlap the test window', () => {
  const trades = [{ exitT: 99 }, { exitT: 100 }, { exitT: 101 }];
  assert.deepEqual(purgeOverlappingTrades(trades, 100), [trades[0]]);
});

test('AUC computes the expected value for distinct scores', () => {
  assert.equal(auc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1]), 0.75);
});

test('AUC assigns average ranks to tied scores', () => {
  assert.equal(auc([0.5, 0.5], [0, 1]), 0.5);
  assert.equal(auc([0.5, 0.5, 0.9], [0, 1, 1]), 0.75);
});

test('AUC returns 0.5 when either class is absent', () => {
  assert.equal(auc([0.1, 0.2], [0, 0]), 0.5);
  assert.equal(auc([0.1, 0.2], [1, 1]), 0.5);
});

test('AUC returns 0.5 for malformed input', () => {
  assert.equal(auc([0.1], [0, 1]), 0.5);
  assert.equal(auc([Number.NaN], [1]), 0.5);
  assert.equal(auc([0.1], [2]), 0.5);
});
