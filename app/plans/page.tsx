import type { Metadata } from 'next';
import PlansClient from './PlansClient';
import { initialScan } from '@/lib/snapshot';
export const metadata: Metadata = { title: 'Trade Plans', description: 'Rule-based entry, stop loss and TP1–TP3 for every active NSE F&O stock with a valid order-block setup, refreshed live.' };
export default async function Page() {
  const initial = await initialScan('15m');
  return <PlansClient initial={initial} />;
}
