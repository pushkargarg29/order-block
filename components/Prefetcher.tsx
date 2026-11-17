'use client';
import { useEffect } from 'react';
import { prefetchChart } from './chartCache';
import { prefetchScan } from './useScan';

/**
 * Makes navigation feel instant:
 *  - preloads a stock's chart the moment the user hovers, focuses or touches a chart link;
 *  - loads the 15m scan in the background on first idle so every page has data ready.
 */
export default function Prefetcher() {
  useEffect(() => {
    const onIntent = (ev: Event) => {
      const a = (ev.target as Element | null)?.closest?.('a[href^="/chart/"]') as HTMLAnchorElement | null;
      if (!a) return;
      const u = new URL(a.href, location.origin);
      const sym = decodeURIComponent(u.pathname.split('/')[2] ?? '').toUpperCase();
      if (/^[A-Z0-9&\-]{1,20}$/.test(sym)) prefetchChart(sym, u.searchParams.get('tf') ?? '15m').catch(() => {});
    };
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('touchstart', onIntent, { passive: true });
    document.addEventListener('focusin', onIntent);
    const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as unknown as { requestIdleCallback: (f: () => void) => number }).requestIdleCallback(cb) : setTimeout(cb, 800));
    idle(() => prefetchScan('15m'));
    return () => {
      document.removeEventListener('pointerover', onIntent);
      document.removeEventListener('touchstart', onIntent);
      document.removeEventListener('focusin', onIntent);
    };
  }, []);
  return null;
}
