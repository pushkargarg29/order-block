'use client';
import { TIMEFRAMES, type Timeframe } from '@/lib/types';
const label: Record<Timeframe, string> = { '5m': '5m', '15m': '15m', '1h': '1H', '1d': '1D' };
export default function TfSwitch({ value, onChange, onIntent }: { value: Timeframe; onChange: (t: Timeframe) => void; onIntent?: (t: Timeframe) => void }) {
  return <div className="seg" role="tablist">{TIMEFRAMES.map(t => <button key={t} className={t === value ? 'on' : ''} onPointerEnter={() => onIntent?.(t)} onFocus={() => onIntent?.(t)} onClick={() => onChange(t)} role="tab" aria-selected={t === value}>{label[t]}</button>)}</div>;
}
