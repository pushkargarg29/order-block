export const methodologyHtml = String.raw`<div class="container" style="padding:40px 20px"><div class="prose">
<h1 style="font-size:42px;letter-spacing:-1px;color:var(--text)">How <span class="grad">Stoclio</span> scores order blocks</h1>
<p>Stoclio translates Smart Money Concepts (SMC) into deterministic rules, evaluates them with walk-forward backtesting, fits a probability model, and applies five market-context adjustments. The methodology below defines how each metric is calculated.</p>
<p><b>Terms and abbreviations:</b> futures and options (F&amp;O), order block (OB), fair value gap (FVG), open interest (OI), average true range (ATR), higher timeframe (HTF), relative strength index (RSI), exponential moving average (EMA), volume-weighted average price (VWAP), put-call ratio (PCR), relative volume (RVOL), last traded price (LTP), take-profit target (TP), risk unit (R), stop loss (SL), and risk-to-reward ratio (R:R). Maximum favorable excursion (MFE) and maximum adverse excursion (MAE) measure the greatest favorable and unfavorable price movement during a trade. Break of structure (BOS) and change of character (CHoCH) describe confirmed changes in market structure. Buy-side and sell-side liquidity are abbreviated as BSL and SSL.</p>

<h2>1. Universe</h2>
<p>The universe includes NSE equities with an active stock-futures contract in the exchange instrument list. The near-month futures contract is used for open-interest analysis. Approximately 1.5 days before expiry, Stoclio rolls to the next contract to avoid misinterpreting the expiry-related decline in open interest.</p>

<h2>2. Order-block engine</h2>
<ul>
<li><b>Structure</b> — fractal pivots (3 bars each side, used only once confirmed). Close beyond the last pivot = BOS; against the prior trend = CHoCH.</li>
<li><b>Order block</b> — among the prior 40 bars (not earlier than the broken pivot minus the swing window), the opposite-color candle with the lowest low for a bullish break or highest high for a bearish break; if none exists, the most extreme candle is used. Candles larger than 2 ATR are refined to the candle body and defended wick.</li>
<li><b>Quality</b> — displacement in ATR, relative volume of the impulse, fair-value-gap confluence, freshness (retests), and invalidation on a close through the block.</li>
<li><b>Liquidity</b> — unswept swing highs/lows clustered within 0.25 ATR (equal highs/lows); a sweep is a wick through a pool that closes back inside.</li>
<li><b>Bias</b> — 0.30·structure + 0.20·EMA 20/50 + 0.20·regression slope + 0.15·RSI + 0.15·VWAP side. Kaufman efficiency &lt; 0.18 or |bias| &lt; 0.2 = <b>Range-bound</b>.</li>
</ul>

<h2>3. Module 1 — Backtest engine &amp; fitted score</h2>
<p>The backtester replays history bar by bar to avoid <b>look-ahead bias</b>: pivots are used only after confirmation, and a block becomes tradable only two bars after the break. Invalidated blocks are skipped. Entry uses the first retest while the plan is valid (through 15:15 IST for intraday; within three sessions for daily), at the block edge or the open if price gaps through. The stop is 0.2 ATR beyond the block; a close through the block exits any remaining size. Intraday trades are squared off at 15:15 IST; daily trades exit after 10 sessions if TP1 was not reached. The target ladder exits 50% at 1R, 30% at 2R and 20% at 3R, moving the stop to breakeven after 1R and to 1R after 2R. Estimated costs are <b>0.06% per side</b> (brokerage, securities transaction tax and slippage). If a stop and target occur in the same bar, the stop is assumed to execute first.</p>
<p>Eleven features are measured on the bar <i>before</i> the touch — aligned bias, efficiency, displacement, impulse volume, FVG, block age, current relative volume, liquidity sweep, higher-timeframe alignment, RSI and block width. An L2-regularized logistic regression is fitted to predict whether <b>price reaches +1R before the stop</b>. Walk-forward validation trains on the oldest 70% of trades, purges training trades that remain open at the test boundary, and evaluates on the newest 30%, using the area under the ROC curve (AUC), Brier score and a calibration table.</p>
<p>The model is fitted offline across the active NSE F&amp;O universe and refreshed periodically. Until model fitting is run, the site shows <b>“Prior model · not fitted”</b> and uses hand-set prior weights. These outputs are not calibrated probabilities. Each chart page also provides a <b>Run backtest</b> option for that stock.</p>

<h2>4. Module 2 — Futures open-interest build-up</h2>
<div class="prose-table-wrap"><table><thead><tr><th>Futures price</th><th>Open interest</th><th>Reading</th><th>Effect</th></tr></thead><tbody>
<tr><td>Up &gt; 0.1%</td><td>Up &gt; 1%</td><td>Long build-up</td><td>Confirms longs</td></tr>
<tr><td>Down</td><td>Up</td><td>Short build-up</td><td>Confirms shorts</td></tr>
<tr><td>Up</td><td>Down &gt; 1%</td><td>Short covering</td><td>Weak long signal</td></tr>
<tr><td>Down</td><td>Down</td><td>Long unwinding</td><td>Weak short signal</td></tr>
</tbody></table></div>
<p>Current-session open interest is compared with the previous session&apos;s closing open interest. Agreement adds +0.30 log-odds (×0.5 for short covering or long unwinding); disagreement subtracts 0.40.</p>

<h2>5. Module 3 — Higher-timeframe alignment</h2>
<p>5m is checked against 15m &amp; 1H, 15m against 1H &amp; 1D, 1H against 1D &amp; weekly, 1D against weekly (weights 0.6 / 0.4), using only <b>completed</b> higher-timeframe bars. Trend = 0.5·EMA alignment + 0.3·regression slope + 0.2·RSI. Alignment is a model feature (so its weight is fitted), and a block that overlaps a live block on the next timeframe adds +0.15.</p>

<h2>6. Module 4 — Index and volatility regime, F&amp;O bans and results</h2>
<ul>
<li>Each stock is matched to NIFTY 50 or BANK NIFTY by the higher return correlation (NIFTY is used on a tie; beta is shown). A signal against a correlated (&gt; 0.4) index trend: −0.35; with it: +0.10.</li>
<li>India VIX ≥ 24, or 18–24 and up more than 8% on the day: −0.15.</li>
<li>Stocks in the NSE F&amp;O ban are removed from the board (still visible in X-Ray, flagged).</li>
<li>Results within 3 days: −0.20 and flagged. The results calendar is fetched from NSE on a best-effort basis; if NSE blocks the request the site shows “calendar unavailable”.</li>
</ul>

<h2>7. Module 5 — Options-chain open-interest walls</h2>
<p>From the current-month options chain, Stoclio identifies the call strike with the highest open interest above spot (resistance), the put strike with the highest open interest below spot (support), the put-call ratio, max pain and at-the-money implied volatility. A defending wall inside the order block (±0.5 ATR) adds +0.20; an opposing wall before +1R subtracts 0.25. These walls are also considered as trade-plan targets and displayed on the chart.</p>

<h2>8. Final score and ranking</h2>
<p><b>Score</b> = 100 × σ( logit(model output) + Σ module adjustments ). A fitted logistic model estimates the base outcome probability; out-of-sample AUC, Brier score and reliability are reported, but fitting alone does not guarantee probability calibration. The module adjustments are fixed, documented heuristics and are <b>not yet calibrated</b> (point-in-time open-interest and options-chain history are unavailable for a fair backtest). <b>Rank</b> = score × (0.55 + 0.45 × proximity to the block), prioritizing setups closer to entry.</p>

<h2>9. Trade plan (entry, stop loss and TP1–TP3)</h2>
<ul>
<li><b>Entry</b> — limit order at the order-block edge (top of a demand block, bottom of a supply block); market if price is already inside the block.</li>
<li><b>Stop loss</b> — far edge of the block ± 0.2 ATR. Plans whose risk is below 0.15 ATR or above 4 ATR are not shown.</li>
<li><b>TP1 / TP2 / TP3</b> — set at a minimum of 1R / 2R / 3R. Each target aligns with the nearest unswept liquidity pool, swing high or low, or options open-interest wall within +1.25R of that multiple; otherwise the exact risk multiple is used. Targets are at least 0.5R apart.</li>
<li><b>Trade management</b> — take profit on 50% of the position at TP1 and move the stop to entry; take profit on 30% at TP2 and trail the stop to TP1; exit the remaining 20% at TP3. Exit early if a candle closes beyond the block; do not enter if the price gaps through the stop.</li>
<li><b>Plan validity</b> — pending intraday entries expire at 15:15 IST, and open intraday trades are closed by 15:15. Daily entries expire after three sessions and are closed after ten sessions if TP1 has not been reached.</li>
<li>The backtester mirrors plan validity, close-based invalidation and exit sizing, but target prices are exact R multiples rather than levels snapped to live structure or options data. Historical rates are therefore not an exact replay of displayed plans; historical OI, options-chain and context adjustments are also unavailable for a fair point-in-time test.</li>
</ul>

<h2>Data &amp; refresh</h2>
<p>To remain within market-data rate limits, Stoclio caches candle history for the day, refreshes the current session&apos;s 5-minute candles approximately every four minutes, updates the forming candle with the latest price on each scan, polls quotes every five seconds through a shared cache, and retrieves open-interest data for the top 60 candidates and options-chain data for the top 25.</p>
</div></div>`;
