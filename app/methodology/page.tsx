import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Methodology' };

export default function Page() {
  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div className="prose">
        <h1 style={{ fontSize: 42, letterSpacing: -1, color: 'var(--text)' }}>How <span className="grad">Stoclio</span> scores order blocks</h1>
        <p>Stoclio turns Smart-Money-Concepts into deterministic rules, measures them with a walk-forward backtest, converts them into a fitted probability,
          and then layers five institutional context modules on top. Every number on the site comes from the rules below.</p>

        <h2>1. Universe</h2>
        <p>Every NSE equity with an active stock future in the exchange instrument master. The near-month future is used for OI; within ~1.5 days of expiry Stoclio rolls to the next month so expiry-day OI collapse is not misread.</p>

        <h2>2. Order-block engine</h2>
        <ul>
          <li><b>Structure</b> — fractal pivots (3 bars each side, used only once confirmed). Close beyond the last pivot = BOS; against the prior trend = CHoCH.</li>
          <li><b>Order block</b> — the last opposite-colour candle before the impulse that broke structure; oversized candles (&gt; 2 ATR) are refined to body + defended wick.</li>
          <li><b>Quality</b> — displacement in ATR, relative volume of the impulse, fair-value-gap confluence, freshness (retests), and invalidation on a close through the block.</li>
          <li><b>Liquidity</b> — unswept swing highs/lows clustered within 0.25 ATR (equal highs/lows); a sweep is a wick through a pool that closes back inside.</li>
          <li><b>Bias</b> — 0.30·structure + 0.20·EMA 20/50 + 0.20·regression slope + 0.15·RSI + 0.15·VWAP side. Kaufman efficiency &lt; 0.18 or |bias| &lt; 0.2 = <b>Range-bound</b>.</li>
        </ul>

        <h2>3. Module 1 — Backtest engine &amp; fitted score</h2>
        <p>The backtester replays history bar by bar with <b>no look-ahead</b>: pivots are used only after confirmation and a block becomes tradable only two bars after the break.
          For each block, the <b>first retest</b> is traded: limit entry at the block edge (or the open if price gaps through), stop 0.2 ATR beyond the block,
          2R target or 40-bar time stop, <b>0.06% cost per side</b> (brokerage + STT + slippage). If stop and target fall in the same bar the stop is assumed hit first.</p>
        <p>Eleven features are measured on the bar <i>before</i> the touch — aligned bias, efficiency, displacement, impulse volume, FVG, block age, current relative volume,
          liquidity sweep, higher-timeframe alignment, RSI and block width. An L2-regularised logistic regression is fitted to the label
          <b> “price reached +1R before the stop”</b>. Validation is walk-forward: trained on the oldest 70% of trades and evaluated on the newest 30% (AUC, Brier score and a calibration table).</p>
        <p>The model is fitted offline across the whole F&amp;O universe and refreshed periodically.
          Until it is fitted the site shows <b>“Uncalibrated model”</b> and uses conservative prior weights. Every chart page also has a <b>Run backtest</b> button for that single stock.</p>

        <h2>4. Module 2 — Futures OI build-up</h2>
        <table><thead><tr><th>Futures price</th><th>Open interest</th><th>Reading</th><th>Effect</th></tr></thead><tbody>
          <tr><td>Up &gt; 0.1%</td><td>Up &gt; 1%</td><td>Long build-up</td><td>Confirms longs</td></tr>
          <tr><td>Down</td><td>Up</td><td>Short build-up</td><td>Confirms shorts</td></tr>
          <tr><td>Up</td><td>Down &gt; 1%</td><td>Short covering</td><td>Weak long signal</td></tr>
          <tr><td>Down</td><td>Down</td><td>Long unwinding</td><td>Weak short signal</td></tr>
        </tbody></table>
        <p>Today&apos;s live OI is compared with the previous session&apos;s closing OI. Agreement adds +0.30 log-odds (×0.5 for covering/unwinding); disagreement subtracts 0.40.</p>

        <h2>5. Module 3 — Higher-timeframe agreement</h2>
        <p>5m is checked against 15m &amp; 1H, 15m against 1H &amp; 1D, 1H against 1D &amp; weekly, 1D against weekly (weights 0.6 / 0.4), using only <b>completed</b> higher-timeframe bars.
          Trend = 0.5·EMA alignment + 0.3·regression slope + 0.2·RSI. Alignment is a model feature (so its weight is fitted), and a block that overlaps a live block on the next timeframe adds +0.15.</p>

        <h2>6. Module 4 — Index &amp; VIX regime, ban list, results</h2>
        <ul>
          <li>Each stock is matched to NIFTY 50 or BANK NIFTY by the higher return correlation (beta is shown). A signal against a correlated (&gt; 0.4) index trend: −0.35; with it: +0.10.</li>
          <li>India VIX ≥ 24, or 18–24 and up more than 8% on the day: −0.15.</li>
          <li>Stocks in the NSE F&amp;O ban are removed from the board (still visible in X-Ray, flagged).</li>
          <li>Results within 3 days: −0.20 and flagged. The results calendar is fetched from NSE on a best-effort basis; if NSE blocks the request the site shows “calendar unavailable”.</li>
        </ul>

        <h2>7. Module 5 — Option-chain OI walls</h2>
        <p>From the current-month option chain: the call strike with the most OI above spot (resistance), the put strike with the most OI below spot (support), PCR, max pain and ATM IV.
          A defending wall inside the order block (±0.5 ATR) adds +0.20; an opposing wall before +1R subtracts 0.25; walls are also used as trade-plan targets and drawn on the chart.</p>

        <h2>8. Final score &amp; ranking</h2>
        <p><b>Score</b> = 100 × σ( logit(model probability) + Σ module adjustments ). With a fitted model the base probability is calibrated on history; the module adjustments are fixed,
          documented heuristics and are <b>not yet calibrated</b> (point-in-time OI and option-chain history are not available for a fair backtest). <b>Rank</b> = score × (0.55 + 0.45 × proximity to the block), which puts actionable setups first.</p>

        <h2>9. Trade plan (entry, stop loss, TP1–TP3)</h2>
        <ul>
          <li><b>Entry</b> — limit order at the order-block edge (top of a demand block, bottom of a supply block); market if price is already inside.</li>
          <li><b>Stop loss</b> — far edge of the block ± 0.2 ATR. Plans whose risk is below 0.15 ATR or above 4 ATR are not shown.</li>
          <li><b>TP1 / TP2 / TP3</b> — at least 1R / 2R / 3R. Each snaps to the nearest unswept liquidity pool, swing high/low or option OI wall lying within +1.25R of that multiple; otherwise the exact R-multiple is used. Targets are at least 0.5R apart.</li>
          <li><b>Management</b> — book 50% at TP1 and move the stop to entry; book 30% at TP2 and trail to TP1; exit 20% at TP3. Exit early on a candle close beyond the block; skip if price gaps through the stop.</li>
          <li><b>Validity</b> — intraday pending entries expire at 15:15 IST and open trades are squared off by 15:15; daily entries expire after 3 sessions and exit after 10 sessions without TP1.</li>
          <li>The backtester simulates exactly this ladder, so the TP1 / TP2 / TP3 hit rates on each chart&apos;s backtest panel describe the same plan you see.</li>
        </ul>

        <h2>Data &amp; refresh</h2>
        <p>To stay within market-data rate limits Stoclio caches candle history for the whole day, refreshes today&apos;s 5-minute candles every ~4 minutes,
          patches the forming bar with the live price every scan, polls quotes every 5 s through one shared cache, and fetches OI for the top 60 and option chains for the top 25 candidates.</p>
      </div>
    </div>
  );
}
