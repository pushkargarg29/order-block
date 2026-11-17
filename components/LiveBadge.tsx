'use client';
import { useEffect, useState } from 'react';
import { isMarketOpen, fmtIST } from '@/lib/time';
export default function LiveBadge({ at, coverage, coverageScope = 'the F&O universe', sampleLabel = 'Updated' }: {
  at?: number | null; coverage?: number; coverageScope?: string; sampleLabel?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (now == null) return null;
  const open = isMarketOpen(new Date(now));
  const scanAt = typeof at === 'number' && Number.isFinite(at) && at > 0 ? at : null;
  const age = scanAt == null ? null : Math.max(0, now - scanAt);
  const fresh = age != null && age < 120000;
  const state = !open ? 'closed' : coverage === 0 ? 'missing' : scanAt == null ? 'waiting' : !fresh ? 'delayed' : coverage != null && coverage < 1 ? 'partial' : 'live';
  const label = state === 'live' ? 'LIVE' : state === 'delayed' ? 'DATA DELAYED' : state === 'partial' ? 'PARTIAL QUOTES'
    : state === 'missing' ? 'NO LIVE QUOTES' : state === 'waiting' ? 'AWAITING FIRST SCAN' : 'MARKET CLOSED';
  const updated = age == null || scanAt == null ? null : age < 60000 ? `${sampleLabel} just now`
    : age < 3600000 ? `${sampleLabel} ${Math.floor(age / 60000)} min ago`
      : age < 86400000 ? `${sampleLabel} ${Math.floor(age / 3600000)} hr ago`
        : `Last quote sample: ${fmtIST(scanAt, true)} IST`;
  const percent = coverage == null ? null : Math.round(coverage * 1000) / 10;
  const title = coverage == null
    ? scanAt != null ? `Latest data sample: ${fmtIST(scanAt, true)} IST` : 'Waiting for the first market scan'
    : `Live price quotes are available for ${percent}% of ${coverageScope}${scanAt != null ? ` · sampled ${fmtIST(scanAt, true)} IST` : ''}`;
  return (
    <span className={`pill live-badge ${state}`} title={title}>
      <span className={`live-dot ${state === 'live' ? '' : state === 'delayed' || state === 'partial' ? 'warn' : 'off'}`} />
      <b>{label}</b>
      {updated && <span className="live-age">{updated}</span>}
    </span>
  );
}
