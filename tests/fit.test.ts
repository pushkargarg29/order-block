import assert from 'node:assert/strict';
import test from 'node:test';
import { auc } from '../lib/fit';

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
