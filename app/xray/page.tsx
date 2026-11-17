import type { Metadata } from 'next';
import XrayClient from './XrayClient';
import { initialScan } from '@/lib/snapshot';
export const metadata: Metadata = { title: 'Market X-Ray' };
export default async function Page() {
  const initial = await initialScan('15m');
  return <XrayClient initial={initial} />;
}
