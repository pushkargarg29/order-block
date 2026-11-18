/** Best-effort NSE public data: F&O ban list (reliable archive CSV) and results calendar (may be blocked from cloud IPs). */
import { memo } from './cache';
import { istDate } from './time';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function getBanList(): Promise<string[] | null> {
  return memo(`ban:${istDate()}`, 3 * 3600000, async () => {
    try {
      const res = await fetch('https://nsearchives.nseindia.com/content/fo/fo_secban.csv', { headers: { 'User-Agent': UA, Accept: 'text/csv,*/*' }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`F&O ban list HTTP ${res.status}`);
      const txt = await res.text();
      const out: string[] = [];
      for (const line of txt.split(/\r?\n/)) { const m = line.match(/^\s*\d+\s*,\s*([A-Z0-9&\-]+)/); if (m) out.push(m[1]); }
      return out;
    } catch (error) {
      console.error('[stoclio] NSE ban list unavailable', error);
      return null;
    }
  });
}

const MONTHS: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
function toIso(d: string): string | null {
  const m = d?.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/); if (!m) return null;
  const mm = MONTHS[m[2].toUpperCase()]; return mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : null;
}

/** symbol -> ISO date of upcoming board meeting for financial results (next ~10 days) */
export function getEarnings(): Promise<Record<string, string> | null> {
  return memo(`earn:${istDate()}`, 6 * 3600000, async () => {
    try {
      const home = await fetch('https://www.nseindia.com/', { headers: { 'User-Agent': UA, Accept: 'text/html' }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const raw = home.headers.get('set-cookie') ?? '';
      const cookie = raw.split(/,(?=[^;]+=)/).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
      const res = await fetch('https://www.nseindia.com/api/event-calendar', { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://www.nseindia.com/', Cookie: cookie }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`results calendar HTTP ${res.status}`);
      const rows: any[] = await res.json();
      const today = istDate(), horizon = istDate(new Date(Date.now() + 10 * 86400000));
      const out: Record<string, string> = {};
      for (const r of Array.isArray(rows) ? rows : []) {
        const text = `${r.purpose ?? ''} ${r.bm_desc ?? ''}`.toLowerCase();
        if (!text.includes('result')) continue;
        const iso = toIso(String(r.date ?? '')); const sym = String(r.symbol ?? '').toUpperCase();
        if (iso && sym && iso >= today && iso <= horizon && (!out[sym] || iso < out[sym])) out[sym] = iso;
      }
      return out;
    } catch (error) {
      console.error('[stoclio] NSE results calendar unavailable', error);
      return null;
    }
  });
}
