export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number; oi?: number };
export type Timeframe = '5m' | '15m' | '1h' | '1d';
export const TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '1d'];
export const isTimeframe = (x: unknown): x is Timeframe => typeof x === 'string' && (TIMEFRAMES as string[]).includes(x);
export type Side = 'bull' | 'bear';
export type Bias = 'bullish' | 'bearish' | 'neutral';

export type Zone = {
  id: string; side: Side; top: number; bottom: number;
  startT: number; breakT: number; availT: number; endT: number | null;
  strength: number; displacementATR: number; rvol: number; hasFVG: boolean;
  touches: number; invalidated: boolean;
};
export type FVG = { side: Side; top: number; bottom: number; t: number; filled: boolean };
export type LiquidityPool = { side: 'buy' | 'sell'; price: number; count: number; t: number };
export type Sweep = { side: 'buy' | 'sell'; price: number; t: number };
export type StructureEvent = { kind: 'BOS' | 'CHoCH'; dir: Side; level: number; t: number; pivotT: number };
export type TpSource = 'Liquidity' | 'Structure' | 'OI wall' | 'R-multiple';
export type TpLevel = { price: number; r: number; source: TpSource };
/** target / rr = TP1 (kept for compatibility). tps = TP1..TP3. */
export type TradePlan = {
  side: Side; entry: number; sl: number; target: number; rr: number; risk: number; riskPct: number;
  tps: TpLevel[]; trigger: 'at-entry' | 'pullback'; distPct: number; invalidation: number;
  validity: string; exitRules: string[];
} | null;

/** ---------- Context (5 institutional modules) ---------- */
export type OiBuildup = 'Long build-up' | 'Short build-up' | 'Short covering' | 'Long unwinding' | 'Neutral';
export type OiInfo = { futKey: string; oi: number; prevOi: number; oiChgPct: number; priceChgPct: number; buildup: OiBuildup; signal: -1 | 0 | 1 };
export type HtfInfo = { tf: Timeframe; trend: number; label: Bias }[];
export type HtfSummary = { frames: HtfInfo; align: number; confluence: boolean };
export type RegimeInfo = {
  nifty: { tfTrend: number; dayTrend: number; ltp: number | null; chgPct: number | null };
  bank: { tfTrend: number; dayTrend: number; ltp: number | null; chgPct: number | null };
  vix: { ltp: number | null; chgPct: number | null; level: 'low' | 'normal' | 'elevated' | 'high' | 'unknown' };
  ban: string[] | null; earnings: Record<string, string> | null; at: number;
};
export type StockRegime = { ref: 'NIFTY' | 'BANKNIFTY'; corr: number; beta: number; refTrend: number; against: boolean; vixPenalty: boolean };
export type OptionWalls = {
  expiry: string; spot: number; callWall: number | null; callWallOi: number; putWall: number | null; putWallOi: number;
  pcr: number | null; maxPain: number | null; atmIv: number | null;
  topCalls: { strike: number; oi: number; chgOi: number }[]; topPuts: { strike: number; oi: number; chgOi: number }[];
};
export type Adjustment = { key: string; label: string; delta: number };
export type Flags = { ban: boolean; earnings: string | null };

export type Analysis = {
  last: number; atr: number; rsi: number; ema20: number; ema50: number; vwap: number | null;
  er: number; rvol: number; trend: number; biasScore: number; bias: Bias; choppy: boolean;
  /** model probability (0-1) that the active zone produces a 1R reaction before stop */
  pModel: number | null; score: number; rank: number; proximity: number;
  zones: Zone[]; activeZone: Zone | null; fvgs: FVG[]; liquidity: LiquidityPool[]; sweeps: Sweep[];
  events: StructureEvent[]; support: number | null; resistance: number | null; liquidityLevel: number | null;
  plan: TradePlan; ema20Series: (number | null)[]; ema50Series: (number | null)[];
  features: Record<string, number> | null;
  /** structure levels used for targets (server-side; stripped from API payloads) */
  planLevels: { price: number; source: TpSource }[];
};

export type Context = {
  oi: OiInfo | null; htf: HtfSummary | null; regime: StockRegime | null; walls: OptionWalls | null;
  flags: Flags; adjustments: Adjustment[];
};

export type ScanRow = {
  symbol: string; name: string; ltp: number; changePct: number | null;
  bias: Bias; score: number; pModel: number | null; rank: number; signed: number; choppy: boolean;
  er: number; rsi: number; rvol: number; atrPct: number;
  zone: { top: number; bottom: number; distATR: number; strength: number } | null;
  support: number | null; resistance: number | null; liquidity: number | null;
  plan: TradePlan; lastEvent: StructureEvent | null; sweep: Sweep | null;
  ctx: Context;
};
export type ScanResult = {
  tf: Timeframe; at: number; total: number; scanned: number; failed: number; rows: ScanRow[];
  quoteAt?: number | null; quoteCoverage?: number;
  regime: RegimeInfo | null; model: { calibrated: boolean; trainedAt: string | null; samples: number };
};

export type BtTrade = {
  t: number; side: Side; entry: number; sl: number; risk: number; p: number;
  hit1R: boolean; hit2R: boolean; hit3R: boolean; /** net R of the TP-ladder trade */ r2: number; mfeR: number; maeR: number; bars: number; features: number[];
};
export type BtStats = {
  trades: number; hitRate1R: number; hitRate2R: number; hitRate3R: number; /** share of trades with net R > 0 */ winRate2R: number; expectancy2R: number; profitFactor: number;
  avgMfeR: number; avgMaeR: number; maxDrawdownR: number; avgBars: number; costR: number;
  brier: number | null; reliability: { bucket: string; n: number; predicted: number; actual: number }[];
};
