import assert from 'node:assert/strict';
import test from 'node:test';
import { auc, purgeOverlappingTrades, splitWalkForwardTrades } from '../lib/fit';

test('walk-forward training excludes trades that overlap the test window', () => {
  const trades = [{ exitT: 99 }, { exitT: 100 }, { exitT: 101 }];
  assert.deepEqual(purgeOverlappingTrades(trades, 100), [trades[0]]);
});

test('walk-forward split keeps same-time entries together and purges training trades through the test start', () => {
  const trades = [
    { t: 1, exitT: 2, id: 'a' },
    { t: 2, exitT: 3, id: 'b' },
    { t: 3, exitT: 4, id: 'c' },
    { t: 3, exitT: 3, id: 'd' },
    { t: 4, exitT: 5, id: 'e' },
    { t: 5, exitT: 6, id: 'f' },
    { t: 5, exitT: 7, id: 'g' },
    { t: 6, exitT: 8, id: 'h' },
    { t: 7, exitT: 9, id: 'i' },
    { t: 8, exitT: 10, id: 'j' }
  ];

  const split = splitWalkForwardTrades(trades, 0.5);
  assert.deepEqual(split.train.map(trade => trade.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(split.test.map(trade => trade.id), ['f', 'g', 'h', 'i', 'j']);
  assert.ok(split.train.every(trade => trade.t < split.test[0].t && trade.exitT < split.test[0].t));
});

test('walk-forward split rejects invalid training ratios', () => {
  assert.throws(() => splitWalkForwardTrades([], 1), RangeError);
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
