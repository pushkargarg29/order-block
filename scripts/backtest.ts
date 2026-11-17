/**
 * Offline walk-forward backtest + model fitting.
 *   npm run backtest -- --tf 15m            (default 15m)
 *   npm run backtest -- --tf all --limit 120 --days 365
 * Reads UPSTOX_ACCESS_TOKEN from .env.local. Writes lib/model-weights.json and reports/backtest-<tf>.md.
 * Redeploy afterwards so the live site uses the fitted, calibrated model.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getFnoUniverse } from '../lib/instruments';
import { getHistory } from '../lib/upstox';
import { runBacktest, summarize, isSignal, BT_HISTORY } from '../lib/backtest';
import { fitLogistic, predictWith, auc, brier, reliability } from '../lib/fit';
import { FEATURE_NAMES } from '../lib/model';
import type { BtTrade, Timeframe } from '../lib/types';
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
  let done = 0;
  for (const u of uni) {
    try {
      const c = await getHistory(u.key, h.unit, h.interval, h.days);
      all.push(...runBacktest(c, tf, { costPct }));
    } catch (e) { console.warn(`  ${u.symbol}: ${(e as Error).message}`); }
    if (++done % 20 === 0) console.log(`  ${done}/${uni.length} stocks · ${all.length} trades`);
  }
  if (all.length < 300) { console.warn(`  only ${all.length} trades — not enough to fit; skipped`); return null; }
  all.sort((a, b) => a.t - b.t);
  const X = all.map(t => t.features), y: number[] = all.map(t => (t.hit1R ? 1 : 0));

  // walk-forward: train on the first 70% of time, evaluate on the most recent 30%
  const cut = Math.floor(all.length * 0.7);
  const m1 = fitLogistic(X.slice(0, cut), y.slice(0, cut));
  const pT = X.slice(cut).map(x => predictWith(m1, x)), yT = y.slice(cut);
  const oos = { auc: auc(pT, yT), brier: brier(pT, yT), baseRate: yT.reduce((a, b) => a + b, 0) / yT.length, samples: yT.length };
  const rel = reliability(pT, yT);

  // final model on all data
  const m = fitLogistic(X, y);
  for (const t of all) t.p = predictWith(m, t.features);
  const sAll = summarize(all, costPct), sSig = summarize(all.filter(isSignal), costPct);
  const hi = summarize(all.filter(t => t.p >= 0.6), costPct);

  const model = {
    calibrated: true, trainedAt: new Date().toISOString(), samples: all.length,
    means: m.means, stds: m.stds, w: m.w, b: m.b, oos,
    stats: { hitRate1R: sAll.hitRate1R, expectancy2R: sAll.expectancy2R, signalHitRate1R: sSig.hitRate1R, signalExpectancy2R: sSig.expectancy2R, highScoreHitRate1R: hi.hitRate1R, highScoreTrades: hi.trades }
  };

  const lines = [
    `# Stoclio backtest — ${tf}`, '', `Generated ${model.trainedAt} · ${uni.length} stocks · ${h.days} days · cost ${(costPct * 100).toFixed(3)}% per side`, '',
    '## Out-of-sample (last 30% of time, model trained on first 70%)', '',
    `- Samples: ${oos.samples} · AUC **${oos.auc.toFixed(3)}** · Brier ${oos.brier.toFixed(4)} · base rate ${pct(oos.baseRate)}`, '',
    '| Predicted bucket | Trades | Avg predicted | Actual 1R hit |', '|---|---|---|---|',
    ...rel.map(r => `| ${r.bucket} | ${r.n} | ${pct(r.predicted)} | ${pct(r.actual)} |`), '',
    '## Full-sample trade statistics (net of costs)', '',
    '| Set | Trades | TP1 hit | TP2 hit | TP3 hit | Profitable | Expectancy (R) | Profit factor | Max DD (R) |', '|---|---|---|---|---|---|---|---|---|',
    ...[['All order-block retests', sAll], ['Stoclio signals (bias-aligned, not choppy)', sSig], ['Score ≥ 60', hi]].map(([n, s]: any) =>
      `| ${n} | ${s.trades} | ${pct(s.hitRate1R)} | ${pct(s.hitRate2R)} | ${pct(s.hitRate3R)} | ${pct(s.winRate2R)} | ${s.expectancy2R.toFixed(3)} | ${s.profitFactor.toFixed(2)} | ${s.maxDrawdownR.toFixed(1)} |`), '',
    '## Fitted weights (standardised features)', '', '| Feature | Weight |', '|---|---|',
    ...FEATURE_NAMES.map((f, i) => `| ${f} | ${m.w[i].toFixed(3)} |`), `| intercept | ${m.b.toFixed(3)} |`, '',
    '> Limitation: uses today\'s F&O list (survivorship bias) and does not model OI / option-chain / regime modules, which are applied live as documented log-odds adjustments.'
  ];
  mkdirSync(join(root, 'reports'), { recursive: true });
  writeFileSync(join(root, 'reports', `backtest-${tf}.md`), lines.join('\n'));
  console.log(`  OOS AUC ${oos.auc.toFixed(3)} · signals 1R hit ${pct(sSig.hitRate1R)} · expectancy ${sSig.expectancy2R.toFixed(3)}R → reports/backtest-${tf}.md`);
  return model;
}

(async () => {
  const path = join(root, 'lib', 'model-weights.json');
  const file = JSON.parse(readFileSync(path, 'utf8'));
  file.models = file.models ?? {};
  for (const tf of tfs) { const m = await runTf(tf); if (m) file.models[tf] = m; }
  file.note = 'Fitted by scripts/backtest.ts. Re-run periodically (e.g. monthly) and redeploy.';
  writeFileSync(path, JSON.stringify(file, null, 2));
  console.log(`\nSaved ${path}. Redeploy to use the calibrated model.`);
})().catch(e => { console.error(e); process.exit(1); });
