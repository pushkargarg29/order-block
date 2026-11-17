'use client';
import { useEffect, useState } from 'react';
import { isMarketOpen, fmtIST } from '@/lib/time';
export default function LiveBadge({ at }: { at?: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (now == null) return null;
  const open = isMarketOpen(new Date(now));
  return (
    <span className="pill" style={{ gap: 8 }}>
      <span className={`live-dot ${open ? '' : 'off'}`} />
      <b className={open ? 'bull' : 'muted'}>{open ? 'LIVE' : 'MARKET CLOSED'}</b>
      <span className="mono">{fmtIST(now)} IST</span>
      {at && <span className="dim mono">· scan {fmtIST(at)}</span>}
    </span>
  );
}
