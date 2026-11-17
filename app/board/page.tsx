import type { Metadata } from 'next';
import BoardClient from './BoardClient';
import { initialScan } from '@/lib/snapshot';
export const metadata: Metadata = { title: 'Liquidity Board' };
export default async function Page() {
  const initial = await initialScan('15m');
  return <BoardClient initial={initial} />;
}
