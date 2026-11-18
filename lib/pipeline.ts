import 'server-only';
import type { Analysis, Candle, Context, OiInfo, OptionWalls, Timeframe, HtfSummary } from './types';
import type { Instrument } from './instruments';
import { analyze } from './smc';
import { getCandles, getOptionWalls, getPrevFutOi, getQuotes, patchLast, type Quote } from './upstox';
import { applyContext, classifyOi, finalize, getRegime, htfCandles, htfSummary, stockRegime } from './context';

export type Stage1 = { inst: Instrument; candles: Candle[]; a: Analysis; htf: HtfSummary | null; q?: Quote };

/** Base analysis + higher-timeframe agreement (fed into the model as a feature). */
export async function stage1(inst: Instrument, tf: Timeframe, q?: Quote): Promise<Stage1 | null> {
  const day = q ? { o: q.open, h: q.high, l: q.low, v: q.volume } : undefined;
  const candles = patchLast(await getCandles(inst.key, tf), q?.ltp, tf, day);
  const a0 = analyze(candles, { intraday: tf !== '1d', tf });
  if (!a0) return null;
  let htf: HtfSummary | null = null;
  try {
    const frames = await htfCandles(inst.key, tf, candles, q?.ltp, day);
    htf = htfSummary(frames, a0.biasScore >= 0 ? 'bull' : 'bear', a0.activeZone);
  } catch (error) {
    console.error('[stoclio] higher-timeframe analysis failed', { symbol: inst.symbol, tf, error });
    htf = null;
  }
  const a = htf ? analyze(candles, { intraday: tf !== '1d', tf, htfAlign: htf.align })! : a0;
  return { inst, candles, a, htf, q };
}

export async function oiFor(inst: Instrument, fq?: Quote): Promise<OiInfo | null> {
  if (!inst.futKey || !fq || !fq.oi) return null;
  const prev = await getPrevFutOi(inst.futKey);
  return prev ? classifyOi(fq.changePct, fq.oi, prev, inst.futKey) : null;
}

export async function stage2(s: Stage1, tf: Timeframe, regime: Awaited<ReturnType<typeof getRegime>> | null,
  extra: { oi?: OiInfo | null; walls?: OptionWalls | null }): Promise<{ a: Analysis; ctx: Context }> {
  const side = s.a.biasScore >= 0 ? 'bull' : 'bear';
  const reg = regime ? stockRegime(s.candles, regime, side) : null;
  const ctx = applyContext(s.a, { oi: extra.oi ?? null, htf: s.htf, regime: reg, walls: extra.walls ?? null, symbol: s.inst.symbol, regimeInfo: regime });
  return { a: finalize(s.a, ctx), ctx };
}

/** Full single-symbol pipeline (chart page): always includes OI and option walls. */
export async function analyzeSymbol(inst: Instrument, tf: Timeframe) {
  const keys = [inst.key, ...(inst.futKey ? [inst.futKey] : [])];
  const quotes = await getQuotes(keys).catch(error => {
    console.error('[stoclio] chart quote request failed', { symbol: inst.symbol, error });
    return new Map<string, Quote>();
  });
  const q = quotes.get(inst.key);
  const [s, regime] = await Promise.all([
    stage1(inst, tf, q),
    getRegime(tf).catch(error => {
      console.error('[stoclio] chart regime request failed', { symbol: inst.symbol, tf, error });
      return null;
    })
  ]);
  if (!s) return { candles: [] as Candle[], analysis: null, ctx: null, quote: q ?? null, regime };
  const [oi, walls] = await Promise.all([
    oiFor(inst, inst.futKey ? quotes.get(inst.futKey) : undefined).catch(error => {
      console.error('[stoclio] chart open-interest enrichment failed', { symbol: inst.symbol, error });
      return null;
    }),
    getOptionWalls(inst.key).catch(error => {
      console.error('[stoclio] chart option-chain enrichment failed', { symbol: inst.symbol, error });
      return null;
    })
  ]);
  const { a, ctx } = await stage2(s, tf, regime, { oi, walls });
  return { candles: s.candles, analysis: a, ctx, quote: q ?? null, regime };
}
