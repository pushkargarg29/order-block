import type { Metadata } from 'next';
import PlansClient from './PlansClient';
import { initialScan } from '@/lib/snapshot';
export const metadata: Metadata = { title: 'Trade Plans', description: 'Rule-based entries, stop losses and take-profit levels for active NSE F&O stocks with valid order-block setups, updated with each market scan.' };
export default async function Page() {
  const initial = await initialScan('15m');
  return <PlansClient initial={initial} />;
}
