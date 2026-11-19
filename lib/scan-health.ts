export function coverageLabel(ratio: number | undefined): string {
  return typeof ratio === 'number' && Number.isFinite(ratio)
    ? `${(ratio * 100).toFixed(1)}%`
    : 'Not reported';
}

export function availabilityLabel(available: number, requested: number): string {
  if (!Number.isFinite(available) || !Number.isFinite(requested)) return 'Not reported';
  return requested > 0 ? `${available}/${requested}` : 'Not requested';
}
