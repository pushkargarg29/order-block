import { NextRequest } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { errorResponse, guard, json, verifyBearerSecret } from '@/lib/guard';
import { getScan, getTop } from '@/lib/snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Scheduled warm-up (vercel.json crons): pre-computes every scan so the first visitor gets data instantly. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') return json({ error: 'Cron authentication is not configured' }, 503);
  if (secret && !verifyBearerSecret(req.headers.get('authorization'), secret)) return json({ error: 'Forbidden' }, 403);
  const blocked = await guard(req, 6, 'warm'); if (blocked) return blocked;
  const job = getScan('15m').then(async () => {
    const results = await Promise.allSettled([getTop(), getScan('5m'), getScan('1h'), getScan('1d')]);
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.status === 'rejected' ? result.reason : undefined), 'One or more warm-up tasks failed');
  });
  waitUntil(job);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const completed = await Promise.race([
      job.then(() => true),
      new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), 250_000); })
    ]);
    if (!completed) return json({ ok: true, status: 'running' }, 202);
  } catch (error) {
    console.error('[stoclio] warm-up failed', error);
    return errorResponse(error, 'Warm-up failed. Check server logs and retry.');
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  return json({ ok: true, at: Date.now() });
}
