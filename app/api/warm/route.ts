import { NextRequest } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { guard, json } from '@/lib/guard';
import { getScan, getTop } from '@/lib/snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Scheduled warm-up (vercel.json crons): pre-computes every scan so the first visitor gets data instantly. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Forbidden' }, 403);
  const blocked = guard(req, 6, 'warm'); if (blocked) return blocked;
  const job = getScan('15m').then(() => Promise.allSettled([getTop(), getScan('5m'), getScan('1h'), getScan('1d')])).catch(e => console.error('[stoclio] warm-up failed', e));
  waitUntil(job);
  await Promise.race([job, new Promise(r => setTimeout(r, 250_000))]);
  return json({ ok: true, at: Date.now() });
}
