import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Prefetcher from '@/components/Prefetcher';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Stoclio — Institutional Order Block & Liquidity for NSE F&O', template: '%s · Stoclio' },
  description: 'See actual order blocks and liquidity on every active NSE F&O stock. Live Liquidity Board, Order Block Charts and Market X-Ray.',
  robots: { index: true, follow: true },
  referrer: 'strict-origin-when-cross-origin'
};
export const viewport: Viewport = { themeColor: '#040914', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  headers().get('x-nonce'); // forces dynamic rendering so every response carries the per-request CSP nonce
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navbar />
        <main>{children}</main>
        <Footer />
        <Prefetcher />
      </body>
    </html>
  );
}
