import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Disclaimer & Risk' };
export default function Page() {
  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div className="prose">
        <h1 style={{ fontSize: 42, letterSpacing: -1, color: 'var(--text)' }}>Disclaimer &amp; <span className="grad">Risk</span></h1>
        <p>Stoclio is an educational market analytics platform. It is <b>not</b> a SEBI-registered investment adviser or research analyst. Nothing displayed constitutes a recommendation to buy, sell or hold any security or derivative.</p>
        <p>Order blocks, liquidity levels, scores and trade plans are generated algorithmically from historical price and volume data. They may be inaccurate, delayed or incomplete. Past performance does not guarantee future results.</p>
        <p>Futures and options are leveraged instruments that carry substantial risk. SEBI studies indicate that most individual F&amp;O traders incur net losses. Trade only with capital you can afford to lose, and consider consulting a registered professional.</p>
        <p>Market data is sourced from licensed exchange data feeds and may be delayed or inaccurate. Stoclio does not collect personal data, use tracking cookies or provide user accounts.</p>
      </div>
    </div>
  );
}
