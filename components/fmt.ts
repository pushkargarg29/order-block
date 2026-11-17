export const f2 = (x: number | null | undefined) => x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (x: number | null | undefined) => x == null || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(2)}%`;
