import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Prefetcher from '@/components/Prefetcher';

export const metadata: Metadata = {
  title: { default: 'Stoclio — Institutional Order Block & Liquidity for NSE F&O', template: '%s · Stoclio' },
  description: 'See actual order blocks and liquidity on every active NSE F&O stock. Live Liquidity Board, Order Block Charts and Market X-Ray.',
  robots: { index: true, follow: true },
  referrer: 'strict-origin-when-cross-origin'
};
export const viewport: Viewport = { themeColor: '#040914', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers();
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main>{children}</main>
        <Footer />
        <Prefetcher />
      </body>
    </html>
  );
}
