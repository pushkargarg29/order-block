/**
 * Offline walk-forward backtest + model fitting.
 *   npm run backtest -- --tf 15m            (default 15m)
 *   npm run backtest -- --tf all --limit 120 --days 365
 * Reads UPSTOX_ACCESS_TOKEN from .env.local. Writes lib/model-weights.json and reports/backtest-<tf>.md.
 * Redeploy afterwards so the live site uses the fitted model; review out-of-sample metrics first.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getFnoUniverse } from '../lib/instruments';
import { getHistory } from '../lib/upstox';
import { runBacktest, summarize, isSignal, BT_HISTORY } from '../lib/backtest';
import { fitLogistic, predictWith, auc, brier, reliability, splitWalkForwardTrades } from '../lib/fit';
import { FEATURE_NAMES } from '../lib/model';
import type { BtStats, BtTrade, Timeframe } from '../lib/types';
import { TIMEFRAMES } from '../lib/types';

const root = join(__dirname, '..');
for (const f of ['.env.local', '.env']) {
  const p = join(root, f);
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
if (!process.env.UPSTOX_ACCESS_TOKEN) { console.error('UPSTOX_ACCESS_TOKEN missing (.env.local)'); process.exit(1); }

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const tfArg = arg('tf', '15m'), limit = +arg('limit', '1000'), costPct = +arg('cost', '0.0006');
const tfs: Timeframe[] = tfArg === 'all' ? TIMEFRAMES : [tfArg as Timeframe];

const pct = (x: number) => (x * 100).toFixed(1) + '%';

async function runTf(tf: Timeframe) {
  const h = { ...BT_HISTORY[tf], days: +arg('days', String(BT_HISTORY[tf].days)) };
  const uni = (await getFnoUniverse()).slice(0, limit);
  console.log(`\n[${tf}] ${uni.length} stocks · ${h.days} days of ${h.interval} ${h.unit}`);
  const all: BtTrade[] = [];
  let done = 0, usable = 0;
  for (const u of uni) {
    try {
      const c = await getHistory(u.key, h.unit, h.interval, h.days);
      if (c.length < 120) {
        console.warn(`  ${u.symbol}: only ${c.length} valid candles; insufficient history`);
      } else {
        all.push(...runBacktest(c, tf, { costPct }));
        usable++;
      }
    } catch (e) { console.warn(`  ${u.symbol}: ${(e as Error).message}`); }
    if (++done % 20 === 0) console.log(`  ${done}/${uni.length} stocks · ${all.length} trades`);
  }
  const coverage = uni.length ? usable / uni.length : 0;
  if (coverage < 0.8) { console.warn(`  only ${pct(coverage)} of symbols have at least 120 valid candles — skipped fitting`); return null; }
  if (all.length < 300) { console.warn(`  only ${all.length} trades — not enough to fit; skipped`); return null; }
  const { train, test } = splitWalkForwardTrades(all);
  const testStart = test[0]?.t;
  if (testStart == null || !train.length) { console.warn('  no usable training or test trades after the walk-forward split — skipped fitting'); return null; }
  const trainY = train.map(t => t.hit1R ? 1 : 0);
  const trainPositives = trainY.filter(label => label === 1).length;
  const trainNegatives = trainY.length - trainPositives;
  const yT = test.map(t => t.hit1R ? 1 : 0);
  const testPositives = yT.filter(label => label === 1).length;
  const testNegatives = yT.length - testPositives;
  if (Math.min(trainPositives, trainNegatives, testPositives, testNegatives) < 10) {
    console.warn('  at least one walk-forward split has fewer than 10 examples of an outcome class — skipped fitting');
    return null;
  }
  const m1 = fitLogistic(train.map(t => t.features), trainY);
  const pT = test.map(t => predictWith(m1, t.features));
  const oos = { auc: auc(pT, yT), brier: brier(pT, yT), baseRate: yT.reduce<number>((a, b) => a + b, 0) / yT.length, samples: yT.length };
  const rel = reliability(pT, yT);
  const oosTrades = test.map((trade, i) => ({ ...trade, p: pT[i] }));
  const oosAll = summarize(oosTrades, costPct);
  const oosSignals = summarize(oosTrades.filter(isSignal), costPct);
  const oosHighScore = summarize(oosTrades.filter(t => t.p >= 0.6), costPct);

  // final model on all data
  const X = all.map(t => t.features), y: number[] = all.map(t => (t.hit1R ? 1 : 0));
  const m = fitLogistic(X, y);
  for (const t of all) t.p = predictWith(m, t.features);
  const sAll = summarize(all, costPct), sSig = summarize(all.filter(isSignal), costPct);
  const hi = summarize(all.filter(t => t.p >= 0.6), costPct);

  const model = {
    fitted: true, trainedAt: new Date().toISOString(), samples: all.length,
    means: m.means, stds: m.stds, w: m.w, b: m.b, oos,
    stats: {
      oosTrades: oosAll.trades, oosExpectancy2R: oosAll.expectancy2R,
      oosSignalTrades: oosSignals.trades, oosSignalHitRate1R: oosSignals.hitRate1R, oosSignalExpectancy2R: oosSignals.expectancy2R,
      oosScore60Trades: oosHighScore.trades, oosScore60HitRate1R: oosHighScore.hitRate1R, oosScore60Expectancy2R: oosHighScore.expectancy2R,
      fullSampleTrades: sAll.trades, fullSampleSignalHitRate1R: sSig.hitRate1R,
      fullSampleSignalExpectancy2R: sSig.expectancy2R, fullSampleScore60Trades: hi.trades
    }
  };

  const strategyRow = (name: string, stats: BtStats) =>
    `| ${name} | ${stats.trades} | ${stats.trades ? pct(stats.hitRate1R) : '—'} | ${stats.trades ? pct(stats.winRate2R) : '—'} | ${stats.trades ? stats.expectancy2R.toFixed(3) : '—'} | ${stats.trades ? stats.profitFactor.toFixed(2) : '—'} | ${stats.trades ? stats.maxDrawdownR.toFixed(1) : '—'} |`;
  const fullSampleRow = ([name, stats]: [string, BtStats]) =>
    `| ${name} | ${stats.trades} | ${pct(stats.hitRate1R)} | ${pct(stats.hitRate2R)} | ${pct(stats.hitRate3R)} | ${pct(stats.winRate2R)} | ${stats.expectancy2R.toFixed(3)} | ${stats.profitFactor.toFixed(2)} | ${stats.maxDrawdownR.toFixed(1)} |`;
  const fullSampleStats: [string, BtStats][] = [
    ['All order-block retests', sAll],
    ['Stoclio signals (bias-aligned, not choppy)', sSig],
    ['Score ≥ 60 (in-sample)', hi]
  ];
  const lines = [
    `# Stoclio backtest — ${tf}`, '', `Generated ${model.trainedAt} · ${uni.length} requested stocks · ${usable} with at least 120 valid candles (${pct(coverage)} coverage) · ${h.days} days · cost ${(costPct * 100).toFixed(3)}% per side`, '',
    '## Walk-forward out-of-sample', '',
    `Test starts at ${new Date(testStart).toISOString()}; all entries at that timestamp are kept in the test set, and training trades must exit before it.`, '',
    `- Samples: ${oos.samples} · AUC **${oos.auc.toFixed(3)}** · Brier ${oos.brier.toFixed(4)} · base rate ${pct(oos.baseRate)}`, '',
    '| Predicted bucket | Trades | Avg predicted | Actual 1R hit |', '|---|---|---|---|',
    ...rel.map(r => `| ${r.bucket} | ${r.n} | ${pct(r.predicted)} | ${pct(r.actual)} |`), '',
    '### Strategy outcomes using only out-of-sample predictions (net of costs)', '',
    '| Set | Trades | TP1 hit | Profitable | Expectancy (R) | Profit factor | Max DD (R) |', '|---|---|---|---|---|---|---|',
    strategyRow('All order-block retests', oosAll), strategyRow('Stoclio signals (bias-aligned, not choppy)', oosSignals), strategyRow('Score ≥ 60', oosHighScore), '',
    '## Full-sample descriptive statistics (not out-of-sample validation)', '',
    '| Set | Trades | TP1 hit | TP2 hit | TP3 hit | Profitable | Expectancy (R) | Profit factor | Max DD (R) |', '|---|---|---|---|---|---|---|---|---|',
    ...fullSampleStats.map(fullSampleRow), '',
    '## Fitted weights (standardised features)', '', '| Feature | Weight |', '|---|---|',
    ...FEATURE_NAMES.map((f, i) => `| ${f} | ${m.w[i].toFixed(3)} |`), `| intercept | ${m.b.toFixed(3)} |`, '',
    '> Limitations: uses today\'s F&O list (survivorship bias) and does not model historical OI, option-chain or regime modules. These live adjustments are not validated by this backtest.'
  ];
  mkdirSync(join(root, 'reports'), { recursive: true });
  writeFileSync(join(root, 'reports', `backtest-${tf}.md`), lines.join('\n'));
  console.log(`  OOS AUC ${oos.auc.toFixed(3)} · OOS signals ${oosSignals.trades} · 1R hit ${pct(oosSignals.hitRate1R)} · expectancy ${oosSignals.expectancy2R.toFixed(3)}R → reports/backtest-${tf}.md`);
  return model;
}

(async () => {
  const path = join(root, 'lib', 'model-weights.json');
  const file = JSON.parse(readFileSync(path, 'utf8'));
  file.models = file.models ?? {};
  let fittedAny = false;
  for (const tf of tfs) {
    const m = await runTf(tf);
    if (m) { file.models[tf] = m; fittedAny = true; }
  }
  if (fittedAny) {
    file.note = 'Fitted by scripts/backtest.ts. Re-run periodically (e.g. monthly) and redeploy.';
    writeFileSync(path, JSON.stringify(file, null, 2));
    console.log(`\nSaved ${path}. Review out-of-sample metrics before deploying fitted weights.`);
  } else {
    console.warn('\nNo models passed the data-quality checks; existing weights were not changed.');
  }
})().catch(e => { console.error(e); process.exit(1); });
