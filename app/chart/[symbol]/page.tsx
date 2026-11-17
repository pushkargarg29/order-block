import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ChartClient from './ChartClient';
import { isTimeframe } from '@/lib/types';
import { initialChart } from '@/lib/snapshot';

export function generateMetadata({ params }: { params: { symbol: string } }): Metadata {
  return { title: `${decodeURIComponent(params.symbol).toUpperCase().slice(0, 20)} Order Block Chart` };
}
export default async function Page({ params, searchParams }: { params: { symbol: string }; searchParams: { tf?: string } }) {
  const sym = decodeURIComponent(params.symbol).toUpperCase();
  if (!/^[A-Z0-9&\-]{1,20}$/.test(sym)) notFound();
  const tf = isTimeframe(searchParams.tf) ? searchParams.tf : '15m';
  const initial = await initialChart(sym, tf);
  return <ChartClient symbol={sym} initialTf={tf} initial={initial} />;
}
