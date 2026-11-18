import assert from 'node:assert/strict';
import test from 'node:test';
import { resample, ema } from '../lib/indicators';
import { classifyOi } from '../lib/context';
import { buildPlan, buildSeries, detect } from '../lib/smc';
import { hasMarketSessionStartedToday } from '../lib/time';
import { patchLast } from '../lib/upstox';
import type { Candle, Zone } from '../lib/types';

const candle = (i: number, o: number, h: number, l: number, c: number, v = 100): Candle => ({
  t: i * 60_000, o, h, l, c, v
});

test('intraday session data is only requested after the NSE session starts on weekdays', () => {
  assert.equal(hasMarketSessionStartedToday(new Date('2026-11-16T03:44:00.000Z')), false);
  assert.equal(hasMarketSessionStartedToday(new Date('2026-11-16T03:45:00.000Z')), true);
  assert.equal(hasMarketSessionStartedToday(new Date('2026-11-15T04:30:00.000Z')), false);
});

test('daily quote patches do not create a candle before the session starts', () => {
  const candles = [candle(1, 90, 105, 88, 100)];
  const beforeOpen = Date.parse('2026-11-16T03:44:00.000Z');
  const patched = patchLast(candles, 101, '1d', { o: 99, h: 101, l: 98, v: 10 }, beforeOpen);
  assert.deepEqual(patched, candles);
});

test('EMA seeds from the first full window and then updates', () => {
  assert.deepEqual(ema([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test('resample preserves OHLCV semantics within each bucket', () => {
  const grouped = resample([
    candle(1, 10, 12, 9, 11, 5),
    candle(2, 11, 13, 10, 12, 7),
    candle(11, 12, 14, 11, 13, 3)
  ], t => Math.floor(t / 600_000));

  assert.deepEqual(grouped, [
    { ...candle(1, 10, 13, 9, 12, 12), t: 60_000 },
    candle(11, 12, 14, 11, 13, 3)
  ]);
});

test('OI classifier distinguishes buildup, unwinding, covering, and neutral readings', () => {
  const classify = (price: number, oi: number) => classifyOi(price, oi, 100, 'FUT');
  assert.equal(classify(0.2, 102).signal, 1);
  assert.equal(classify(-0.2, 102).signal, -1);
  assert.equal(classify(0.2, 98).signal, 0.5);
  assert.equal(classify(-0.2, 98).signal, -0.5);
  assert.equal(classify(0.05, 100).signal, 0);
});

test('structure break creates an order block tradable only after its availability delay', () => {
  const candles = [
    candle(0, 9, 10, 8, 10),
    candle(1, 10, 12, 9, 11),
    candle(2, 11, 11, 9.5, 10),
    candle(3, 11, 13, 10, 13, 200),
    candle(4, 13, 14, 12, 14, 200),
    candle(5, 14, 15, 13, 15, 200),
    candle(6, 15, 16, 14, 15.5),
    candle(7, 15.5, 15.8, 14.5, 15)
  ];
  const result = detect(candles, buildSeries(candles), 1);

  assert.ok(result.events.some(e => e.kind === 'BOS' && e.dir === 'bull' && e.t === candles[3].t));
  assert.equal(result.zones[0]?.side, 'bull');
  assert.equal(result.zoneIdx[0]?.avail, 5);
  assert.equal(result.zones[0]?.availT, candles[5].t);
});

test('trade plan targets are increasing and a choppy setup is suppressed', () => {
  const zone: Zone = {
    id: 'bull-test', side: 'bull', top: 100, bottom: 98, startT: 0, breakT: 1, availT: 2, endT: null,
    strength: 0.8, displacementATR: 1, rvol: 1.2, hasFVG: true, touches: 0, invalidated: false
  };
  const plan = buildPlan('bull', 100, 1, zone, 98, 110, [
    { price: 102.2, source: 'Structure' },
    { price: 104.4, source: 'Liquidity' },
    { price: 106.6, source: 'Structure' }
  ], false, true);

  assert.ok(plan);
  assert.ok(plan.tps.every((x, i) => Math.abs(x.price - [102.2, 104.4, 106.6][i]) < 1e-9));
  assert.ok(plan.tps[0].price < plan.tps[1].price && plan.tps[1].price < plan.tps[2].price);
  assert.equal(buildPlan('bull', 100, 1, zone, 98, 110, [], true, true), null);
});
