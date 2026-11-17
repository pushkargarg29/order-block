import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Disclaimer & Risk' };
export default function Page() {
  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div className="prose">
        <h1 style={{ fontSize: 42, letterSpacing: -1, color: 'var(--text)' }}>Disclaimer &amp; <span className="grad">Risk</span></h1>
        <p>Stoclio is an educational market-analytics tool. It is <b>not</b> a SEBI-registered investment adviser or research analyst, and nothing displayed constitutes a recommendation to buy, sell or hold any security or derivative.</p>
        <p>Order blocks, liquidity levels, scores and trade plans are produced algorithmically from historical price and volume data. They can be wrong, delayed or incomplete. Past behaviour does not guarantee future results.</p>
        <p>Futures &amp; options are leveraged instruments. Per SEBI studies, the large majority of individual F&amp;O traders incur net losses. Trade only with capital you can afford to lose and consult a registered professional.</p>
        <p>Market data is sourced from licensed exchange data feeds and may be subject to delays or errors. Stoclio does not collect personal data, uses no cookies for tracking and has no user accounts.</p>
      </div>
    </div>
  );
}
