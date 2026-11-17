'use client';
import type { ScanRow } from '@/lib/types';

/** Dot histogram: every F&O stock placed by signed conviction score (-100 bearish … +100 bullish) */
export default function Distribution({ rows, onPick }: { rows: Pick<ScanRow, 'symbol' | 'signed' | 'choppy'>[]; onPick?: (s: string) => void }) {
  const BINS = 25, W = 760, H = 220, mid = H / 2, r = 3.4, gap = 8.2;
  const bins: Pick<ScanRow, 'symbol' | 'signed' | 'choppy'>[][] = Array.from({ length: BINS }, () => []);
  for (const row of rows) { const b = Math.min(BINS - 1, Math.max(0, Math.floor(((row.signed + 100) / 200) * BINS))); bins[b].push(row); }
  const colW = (W - 40) / BINS;
  const strongest = [...rows].filter(r => !r.choppy).sort((a, b) => Math.abs(b.signed) - Math.abs(a.signed));
  const topBull = new Set(strongest.filter(r => r.signed > 0).slice(0, 3).map(r => r.symbol));
  const topBear = new Set(strongest.filter(r => r.signed < 0).slice(0, 3).map(r => r.symbol));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Distribution of F&O stocks by order block conviction">
      <line x1="20" x2={W - 20} y1={mid} y2={mid} stroke="#16284d" />
      <line x1={W / 2} x2={W / 2} y1="10" y2={H - 10} stroke="#1f3766" strokeDasharray="3 4" />
      {bins.map((b, bi) => b.sort((a, c) => Math.abs(c.signed) - Math.abs(a.signed)).map((row, k) => {
        const cx = 20 + bi * colW + colW / 2 + ((k % 2) - 0.5) * (colW * 0.45);
        const level = Math.floor(k / 2);
        const bull = row.signed > 0;
        const cy = bull ? mid - 8 - level * gap : row.signed < 0 ? mid + 8 + level * gap : mid + (k % 2 ? 8 : -8) * (level + 1);
        if (cy < 4 || cy > H - 4) return null;
        const strong = topBull.has(row.symbol) || topBear.has(row.symbol);
        const fill = row.choppy ? '#3a4a6a' : bull ? '#34d399' : '#f87171';
        return (
          <g key={row.symbol} style={{ cursor: onPick ? 'pointer' : 'default' }} onClick={() => onPick?.(row.symbol)}>
            <title>{`${row.symbol}  ${row.signed > 0 ? '+' : ''}${row.signed}`}</title>
            {strong && <circle cx={cx} cy={cy} r={r + 3.5} fill="none" stroke={fill} strokeWidth="1.4" />}
            <circle cx={cx} cy={cy} r={r} fill={fill} opacity={row.choppy ? 0.7 : 0.95} />
          </g>
        );
      }))}
      <text x="22" y={H - 8} fill="#f87171" fontSize="13" fontWeight="700">Bearish</text>
      <text x={W - 22} y="20" fill="#34d399" fontSize="13" fontWeight="700" textAnchor="end">Bullish</text>
      <text x={W / 2 + 8} y={H - 8} fill="#a3b4d4" fontSize="13">● Range-bound  ◉ Strongest</text>
    </svg>
  );
}
