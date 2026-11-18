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
  { title: 'Liquidity Board', href: '/board', items: ['Top-ranked bullish and bearish setups, updated in real time', 'Entry, stop loss and targets for each order block', 'Range-bound stocks and securities under F&O ban are excluded'] },
  { title: 'Order Block Charts', href: '/chart', items: ['Order blocks, fair value gaps and liquidity sweeps', 'Options open-interest walls, max pain and support/resistance levels', '2D and interactive 3D charts with five timeframes of context'] },
  { title: 'Trade Plans', href: '/plans', items: ['Entry, stop loss and TP1–TP3 for every valid setup', 'Exit rules for partial profit-taking and trailing stops', 'Filter by direction, score or entry status; export to CSV'] },
  { title: 'Market X-Ray', href: '/xray', items: ['Every active NSE stock-futures symbol in one sortable table', 'Open-interest build-up, higher-timeframe trend and index regime', 'Filter, sort and export data to CSV'] }
];

const pipeline = [
  ['Scan', 'Every NSE stock with an active futures contract is analyzed using recent candles, price quotes and futures open interest.'],
  ['Detect', 'Market structure (BOS / CHoCH), order blocks, fair value gaps, liquidity pools and liquidity sweeps, without look-ahead bias.'],
  ['Score', 'A walk-forward logistic model can estimate the chance that the nearest order block holds to +1R. Until fitted, Stoclio uses prior weights that are not calibrated probabilities.'],
  ['Confirm', 'Futures open-interest build-up, higher-timeframe trend, NIFTY / BANK NIFTY market regime, India VIX and options open-interest walls adjust the score.'],
  ['Plan & rank', 'Each valid setup receives an entry, stop loss and TP1–TP3. Setups with the highest scores and greatest proximity to entry rank first.']
];

const modules = [
  ['01', 'Backtested score', 'Walk-forward backtest net of 0.06% costs per side. Calibration status is shown on every page.'],
  ['02', 'Futures open-interest build-up', 'Long build-up, short build-up, short covering or long unwinding compared with the previous session.'],
  ['03', 'Higher-timeframe agreement', 'Lower-timeframe blocks are weighted by the higher-timeframe trend, with a bonus when zones overlap.'],
  ['04', 'Index and VIX regime', 'Each stock is matched to NIFTY or BANK NIFTY by correlation; VIX spikes, F&O bans and upcoming results are flagged.'],
  ['05', 'Options open-interest walls', 'Highest call and put open-interest strikes, put-call ratio and max pain are shown on charts and considered as targets.']
];

const faq = [
  ['Which stocks does Stoclio cover?', 'NSE equities with an active stock-futures contract. The list refreshes automatically from the exchange instrument list to include additions and remove expired or inactive contracts.'],
  ['How frequently is market data updated?', 'During market hours (09:15–15:30 IST), price quotes refresh every five seconds and the full scan is rebuilt approximately once a minute. Outside market hours, the most recent session is displayed.'],
  ['How are entry, stop loss and TP1–TP3 set?', 'Entry is set at the order-block edge, with the stop 0.2 ATR beyond the block. TP1, TP2 and TP3 are set at a minimum of 1R, 2R and 3R, respectively, and may align with nearby liquidity, swing levels or options open-interest walls. The plan allocates 50% at TP1, 30% at TP2 and 20% at TP3, moving the stop to entry after TP1. Plans are not shown for range-bound stocks.'],
  ['What does the score mean?', 'The score ranks setups using the model output, market context and distance to the order block. Prior weights are used until a model is fitted, and neither prior nor fitted outputs guarantee calibrated probabilities or future performance.'],
  ['Which timeframes are supported?', '5-minute, 15-minute, 1-hour and daily. Each timeframe is evaluated against higher timeframes before setups are ranked.'],
  ['Do I need an account?', 'No. Stoclio is free to use and does not require an account or login. It does not use tracking cookies.'],
  ['Does Stoclio provide investment advice?', 'No. Stoclio is an analytics platform, not a SEBI-registered investment adviser. Its levels and scores are algorithmic and may be inaccurate. Trading derivatives involves a substantial risk of loss.']
];

export default async function Home() {
  const [scan, top] = await Promise.all([initialScan('15m'), initialTop()]);
  return (
    <ScanProvider data={scan}>
      <div className="hero-wrap">
        <div className="hero-3d" aria-hidden="true"><div className="floor" /><div className="orb o1" /><div className="orb o2" /></div>
        <section className="container hero">
          <div className="hero-copy">
            <span className="pill"><span className="live-dot" /> Live analysis across active NSE F&amp;O stocks</span>
            <h1 className="hero-title">
              <span>See Real</span>
              <span className="hero-title-highlight"><span className="hl-box"><span className="grad">Order Blocks</span></span></span>
              <span className="grad">&amp; Liquidity</span>
            </h1>
            <p className="lead">Order blocks, liquidity pools and liquidity sweeps across the active NSE F&amp;O universe—scored, confirmed with open-interest data and ranked in real time.</p>
            <ul>
              <li><Icon d="M7 3v18M17 3v18M4 7h6v8H4zM14 9h6v6h-6z" /> Order blocks validated by displacement, volume and imbalance</li>
              <li><Icon d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 2v5M12 17v5M2 12h5M17 12h5" /> Liquidity pools and sweeps detected in real time</li>
              <li><Icon d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 12l3 3 5-6" /> Range-bound stocks are automatically filtered out</li>
              <li><Icon d="M3 4h14v10H3zM7 18h6M19 8h2v12h-6v-4" /> Optimized for phones, tablets and desktops</li>
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
                <span className="pill neutp">LIVE SETUP</span>
                <div><div className="hero-card-title">Top-ranked setup</div><div className="muted">The highest-ranked active order-block setup.</div></div>
              </div>
              <LiveSetup initial={top} />
            </div>
          </TiltCard>
        </section>
        <div className="container" style={{ position: 'relative', zIndex: 1, paddingBottom: 20 }}><LivePulse /></div>
      </div>

      <section className="container section">
        <span className="pill center-pill"><span className="live-dot" /> Live leaders · 15m</span>
        <h2>Today&apos;s <span className="grad">top-ranked</span> setups</h2>
        <p className="sub">Ranked by score and distance to the order block. Prices update every few seconds in market hours. Select any stock to open its full chart.</p>
        <LiveLeaders />
        <div style={{ textAlign: 'center', marginTop: 24 }}><Link href="/board" className="btn">See the full Liquidity Board →</Link></div>
      </section>

      <section className="container section">
        <span className="pill center-pill">Interactive 3D market view</span>
        <h2>The active NSE F&amp;O universe, <span className="grad">in 3D</span></h2>
        <p className="sub">Each point represents an active NSE F&amp;O stock. Position shows directional bias and daily price change; depth represents relative volume. Drag to rotate the view, then select a stock to open its chart.</p>
        <div className="card glass" style={{ padding: 'var(--card-padding)' }}><Universe height={560} /></div>
      </section>

      <section className="container section">
        <span className="pill center-pill">How it works</span>
        <h2>Every active F&amp;O stock. <span className="grad">One consistent analysis.</span></h2>
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
        <span className="pill center-pill">Market analysis engine</span>
        <h2>Five layers of <span className="grad">confirmation</span></h2>
        <p className="sub">Order blocks are evaluated alongside complementary market, volatility and derivatives data.</p>
        <div className="grid3">
          {modules.map(([n, t, d]) => (
            <TiltCard key={n}><div className="card mod glass" style={{ height: '100%' }}><span className="num">{n}</span><h3>{t}</h3><p>{d}</p></div></TiltCard>
          ))}
          <Link href="/methodology" className="card mod glass mod-link">
            <span className="num">→</span><h3 className="grad">Read the full methodology</h3><p>Review the rules, model weights and known limitations.</p>
          </Link>
        </div>
      </section>

      <section className="container section">
        <div className="vs">
          <div className="card" style={{ padding: 'var(--card-padding)' }}>
            <h3 className="vs-title dim">Without Stoclio</h3>
            {['Entries placed into institutional supply', 'No view of resting liquidity', 'Capital tied up in range-bound stocks'].map(t => <div key={t} className="xrow muted"><span className="x">✕</span>{t}</div>)}
          </div>
          <div className="vs-badge">VS</div>
          <div className="card with" style={{ padding: 'var(--card-padding)' }}>
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
        <h2>Start with today&apos;s <span className="grad">top-ranked setups</span></h2>
        <p className="sub">NSE market data, documented rules and no account required.</p>
        <Link href="/board" className="btn btn-primary">Open Liquidity Board →</Link>
      </section>
    </ScanProvider>
  );
}
