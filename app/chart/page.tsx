import type { Metadata } from 'next';
import StockSearch from '@/components/StockSearch';

export const metadata: Metadata = { title: 'Order Block Charts' };

export default function ChartIndexPage() {
  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Order Block Charts</h1>
          <p className="muted" style={{ marginTop: 8 }}>Search for an active NSE F&amp;O stock to open its order-block chart.</p>
        </div>
      </div>
      <div className="card glass" style={{ padding: 'var(--card-padding)' }}>
        <StockSearch placeholder="Search by symbol or company name..." label="Search active NSE F&O stocks by symbol or company name" />
      </div>
    </div>
  );
}
