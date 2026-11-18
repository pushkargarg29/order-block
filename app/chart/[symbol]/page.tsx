import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ChartClient from './ChartClient';
import { isTimeframe } from '@/lib/types';
import { initialChart } from '@/lib/snapshot';

type PageProps = {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol).toUpperCase().slice(0, 20)} Order Block Chart` };
}
export default async function Page({ params, searchParams }: PageProps) {
  const [{ symbol }, query] = await Promise.all([params, searchParams]);
  const sym = decodeURIComponent(symbol).toUpperCase();
  if (!/^[A-Z0-9&\-]{1,20}$/.test(sym)) notFound();
  const requestedTf = Array.isArray(query.tf) ? query.tf[0] : query.tf;
  const tf = isTimeframe(requestedTf) ? requestedTf : '15m';
  const initial = await initialChart(sym, tf);
  return <ChartClient key={sym} symbol={sym} initialTf={tf} initial={initial} />;
}
