import Link from 'next/link';
import LiveSetup from '@/components/LiveSetup';
import Universe from '@/components/three/Universe';
import TiltCard from '@/components/three/TiltCard';
import { LivePulse, LiveLeaders } from '@/components/home/HomeLive';
import ScanProvider from '@/components/ScanSeed';
import { initialScan, initialTop } from '@/lib/snapshot';

const Check = () => <i aria-hidden="true">✓</i>;
const Icon = ({ d }: { d: string }) => (
  <span className="ico" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg></span>
);

const products = [
  { title: 'Liquidity Board', href: '/board', items: ['Top bullish & bearish setups, ranked live', 'Entry, stop & target from each order block', 'Range-bound and F&O-ban stocks excluded'] },
  { title: 'Order Block Charts', href: '/chart/SBIN', items: ['Order blocks, FVGs & liquidity sweeps', 'Option OI walls, max pain & S/R levels', '2D or interactive 3D, five timeframes of context'] },
  { title: 'Trade Plans', href: '/plans', items: ['Entry, stop loss & TP1–TP3 for every valid setup', 'Exit rules: partial bookings & trailing stop', 'Filter by side, score or at-entry; export CSV'] },
  { title: 'Market X-Ray', href: '/xray', items: ['Every F&O stock in one sortable table', 'OI build-up, HTF trend & index regime', 'Filter, sort and export to CSV'] }
];

const pipeline = [
  ['Scan', 'Every NSE stock with an active future is pulled with fresh candles, quotes and futures open interest.'],
  ['Detect', 'Market structure (BOS / CHoCH), order blocks, fair value gaps, liquidity pools and stop-hunt sweeps — no look-ahead.'],
  ['Score', 'A model built from a walk-forward backtest estimates how likely the nearest order block is to hold to +1R.'],
  ['Confirm', 'Futures OI build-up, higher-timeframe trend, NIFTY / BANK NIFTY regime, India VIX and option OI walls adjust the score.'],
  ['Plan & rank', 'Each valid setup gets an entry, stop loss and TP1–TP3; setups closest to entry with the highest score rank first.']
];

const modules = [
  ['01', 'Backtested score', 'Walk-forward backtest net of 0.06% costs per side. Calibration status is shown on every page.'],
  ['02', 'Futures OI build-up', 'Long build-up, short build-up, short covering or long unwinding versus the previous session.'],
  ['03', 'Higher-timeframe agreement', 'Lower-timeframe blocks are weighted by the higher-timeframe trend, with a bonus when zones overlap.'],
  ['04', 'Index & VIX regime', 'Each stock is matched to NIFTY or BANK NIFTY by correlation; VIX spikes, F&O ban and results are flagged.'],
  ['05', 'Option OI walls', 'Highest call & put OI strikes, PCR and max pain — drawn on charts and used as targets.']
];

const faq = [
  ['Which stocks does Stoclio cover?', 'Every NSE equity that currently has an active stock-futures contract. The list refreshes automatically from the exchange instrument list, so additions and exits are picked up.'],
  ['How live is the data?', 'During market hours (09:15–15:30 IST) prices refresh every 5 seconds and the full scan is rebuilt about every minute. Outside market hours the last session is shown.'],
  ['How are entry, stop loss and TP1–TP3 set?', 'Entry is at the order-block edge, the stop sits 0.2 ATR beyond the block, and TP1 / TP2 / TP3 are at least 1R / 2R / 3R, placed on the nearest liquidity, swing level or option OI wall when one is close. The plan books 50% at TP1, 30% at TP2 and 20% at TP3, moving the stop to entry after TP1. No plan is shown for choppy stocks.'],
  ['What does the score mean?', 'It estimates the chance that the nearest order block holds long enough for price to move one risk-unit (1R) in your favour, adjusted for OI, higher timeframes, index regime and option walls. When the badge says “model uncalibrated”, scores use prior weights rather than fitted probabilities.'],
  ['Which timeframes are supported?', '5-minute, 15-minute, 1-hour and daily. Each is checked against higher timeframes before it is ranked.'],
  ['Do I need an account?', 'No. Stoclio is free with no sign-up, login or tracking cookies.'],
  ['Is this investment advice?', 'No. Stoclio is an analytics tool and is not SEBI-registered. Levels and scores are algorithmic, can be wrong, and derivatives carry a high risk of loss.']
];

export default async function Home() {
  const [scan, top] = await Promise.all([initialScan('15m'), initialTop()]);
  return (
    <ScanProvider data={scan}>
      <div className="hero-wrap">
        <div className="hero-3d" aria-hidden="true"><div className="floor" /><div className="orb o1" /><div className="orb o2" /></div>
        <section className="container hero">
          <div className="hero-copy">
            <span className="pill"><span className="live-dot" /> Live on every active NSE F&amp;O stock</span>
            <h1>See Real <span className="hl-box"><span className="grad">Order Blocks</span></span><br /><span className="grad">&amp; Liquidity</span></h1>
            <p className="lead">Institutional order blocks, liquidity pools and stop-hunts across the whole F&amp;O market — scored, confirmed with OI and ranked live.</p>
            <ul>
              <li><Icon d="M7 3v18M17 3v18M4 7h6v8H4zM14 9h6v6h-6z" /> Order blocks validated by displacement, volume &amp; imbalance</li>
              <li><Icon d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 2v5M12 17v5M2 12h5M17 12h5" /> Liquidity pools &amp; stop-hunt sweeps detected live</li>
              <li><Icon d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 12l3 3 5-6" /> Range-bound stocks filtered out automatically</li>
              <li><Icon d="M3 4h14v10H3zM7 18h6M19 8h2v12h-6v-4" /> Optimised for phone, tablet and desktop</li>
            </ul>
            <div className="cta-row">
              <Link href="/board" className="btn btn-primary">Open Liquidity Board →</Link>
              <Link href="/methodology" className="btn">How it works</Link>
            </div>
            <p className="dim" style={{ marginTop: 16, fontSize: 14 }}>Free to use · No account required</p>
          </div>
          <TiltCard max={4}>
            <div className="card glass hero-card">
              <div className="hero-card-head">
                <span className="grad big1">1</span>
                <div><div className="hero-card-title">One clear zone</div><div className="muted">The strongest live setup right now.</div></div>
              </div>
              <LiveSetup initial={top} />
            </div>
          </TiltCard>
        </section>
        <div className="container" style={{ position: 'relative', zIndex: 1, paddingBottom: 20 }}><LivePulse /></div>
      </div>

      <section className="container section">
        <span className="pill center-pill"><span className="live-dot" /> Live leaders · 15m</span>
        <h2>Today&apos;s <span className="grad">highest-conviction</span> setups</h2>
        <p className="sub">Ranked by score and distance to the order block. Prices update every few seconds in market hours. Select any stock to open its full chart.</p>
        <LiveLeaders />
        <div style={{ textAlign: 'center', marginTop: 24 }}><Link href="/board" className="btn">See the full Liquidity Board →</Link></div>
      </section>

      <section className="container section">
        <span className="pill center-pill">Interactive 3D · Live</span>
        <h2>The entire F&amp;O market, <span className="grad">in 3D</span></h2>
        <p className="sub">Each sphere is a live F&amp;O stock — left to right from bearish to bullish conviction, up and down by day change, front to back by relative volume. Drag to rotate and select a stock to open its chart.</p>
        <div className="card glass" style={{ padding: 'clamp(8px,2vw,14px)' }}><Universe height={560} /></div>
      </section>

      <section className="container section">
        <span className="pill center-pill">How it works</span>
        <h2>Every F&amp;O stock. <span className="grad">One clear answer.</span></h2>
        <p className="sub">Five steps run on every scan, using the same rules you can read on the methodology page.</p>
        <ol className="pipeline">
          {pipeline.map(([t, d], i) => (
            <li key={t} className="card glass"><span className="step">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ol>
      </section>

      <section className="container section">
        <div className="grid4">
          {products.map(f => (
            <TiltCard key={f.title}><Link href={f.href} className="card feat glass" style={{ display: 'block', height: '100%' }}>
              <h3 className="grad">{f.title}</h3>
              {f.items.map(i => <div key={i} className="check"><Check />{i}</div>)}
            </Link></TiltCard>
          ))}
        </div>
      </section>

      <section className="container section">
        <span className="pill center-pill">Institutional engine</span>
        <h2>Five layers of <span className="grad">confirmation</span></h2>
        <p className="sub">An order block alone is not enough. Each one is checked against the data institutional desks watch.</p>
        <div className="grid3">
          {modules.map(([n, t, d]) => (
            <TiltCard key={n}><div className="card mod glass" style={{ height: '100%' }}><span className="num">{n}</span><h3>{t}</h3><p>{d}</p></div></TiltCard>
          ))}
          <Link href="/methodology" className="card mod glass mod-link">
            <span className="num">→</span><h3 className="grad">Read the full methodology</h3><p>Every rule, weight and limitation, in plain sight.</p>
          </Link>
        </div>
      </section>

      <section className="container section">
        <div className="vs">
          <div className="card" style={{ padding: 'clamp(20px,4vw,32px)' }}>
            <h3 className="vs-title dim">Without Stoclio</h3>
            {['Entries placed into institutional supply', 'No view of resting liquidity', 'Capital tied up in range-bound stocks'].map(t => <div key={t} className="xrow muted"><span className="x">✕</span>{t}</div>)}
          </div>
          <div className="vs-badge">VS</div>
          <div className="card with" style={{ padding: 'clamp(20px,4vw,32px)' }}>
            <h3 className="vs-title">With <span className="grad">Stoclio</span></h3>
            {['Entries aligned with institutional order blocks', 'Liquidity levels mapped on every chart', 'Only high-conviction setups, ranked'].map(t => <div key={t} className="xrow"><span className="v">✓</span>{t}</div>)}
          </div>
        </div>
      </section>

      <section className="container section">
        <h2>Questions, <span className="grad">answered</span></h2>
        <div className="faq">
          {faq.map(([q, a]) => (
            <details key={q} className="card glass"><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      <section className="container section" style={{ textAlign: 'center' }}>
        <h2>Start with today&apos;s <span className="grad">strongest setups</span></h2>
        <p className="sub">Live NSE data, transparent rules and no sign-up required.</p>
        <Link href="/board" className="btn btn-primary">Open Liquidity Board →</Link>
      </section>
    </ScanProvider>
  );
}
