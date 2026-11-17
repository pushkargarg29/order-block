import Link from 'next/link';
import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="foot-grid">
          <div>
            <div className="logo" style={{ marginBottom: 14 }}><Logo /> <span>Stoc<span className="grad">lio</span></span></div>
            <p className="muted" style={{ maxWidth: 420, lineHeight: 1.6 }}>
              Institutional-grade order block and liquidity analytics for every active NSE F&amp;O stock. Free, no sign-up.
            </p>
          </div>
          <div>
            <h4>Platform</h4>
            <Link href="/board">Liquidity Board</Link>
            <Link href="/plans">Trade Plans</Link>
            <Link href="/chart/SBIN">Order Block Charts</Link>
            <Link href="/xray">Market X-Ray</Link>
          </div>
          <div>
            <h4>Resources</h4>
            <Link href="/methodology">Methodology</Link>
            <Link href="/disclaimer">Disclaimer &amp; Risk</Link>
          </div>
        </div>
        <div className="foot-bottom">
          © {new Date().getFullYear()} Stoclio. Live NSE market data. Stoclio is an analytics tool and is not a SEBI-registered investment adviser.
          Nothing on this site is investment advice. Trading in derivatives involves substantial risk of loss.
        </div>
      </div>
    </footer>
  );
}
