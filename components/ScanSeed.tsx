'use client';
import type { ReactNode } from 'react';
import type { ScanResult } from '@/lib/types';
import { ScanSeedContext } from './useScan';
/** Provides server-rendered scan data to every live component on the page. */
export default function ScanProvider({ data, children }: { data: ScanResult | null; children: ReactNode }) {
  return <ScanSeedContext.Provider value={data}>{children}</ScanSeedContext.Provider>;
}
