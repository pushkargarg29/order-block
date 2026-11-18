const IST = 19800000;
export function istDate(d = new Date()): string { return new Date(d.getTime() + IST).toISOString().slice(0, 10); }
export function istDateMinus(days: number, from = Date.now()): string { return istDate(new Date(from - days * 86400000)); }
export const istDayNum = (t: number) => Math.floor((t + IST) / 86400000);
export function hasMarketSessionStartedToday(d = new Date()): boolean {
  const x = new Date(d.getTime() + IST);
  const day = x.getUTCDay();
  return day > 0 && day < 6 && x.getUTCHours() * 60 + x.getUTCMinutes() >= 555;
}
export function isMarketOpen(d = new Date()): boolean {
  const x = new Date(d.getTime() + IST);
  const day = x.getUTCDay();
  if (day === 0 || day === 6) return false;
  const m = x.getUTCHours() * 60 + x.getUTCMinutes();
  return m >= 555 && m <= 930; // 09:15 - 15:30 IST
}
export function fmtIST(t: number, withDate = false): string {
  return new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false, ...(withDate ? { day: '2-digit', month: 'short' } : {}) });
}
