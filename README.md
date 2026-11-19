# Stoclio — Institutional Order Block & Liquidity Platform (NSE F&O)

Next.js 16 full-stack app. Requires Node.js 20.9 or later. No database, no login. Live data from Upstox.

## What's inside
- **Liquidity Board** (`/board`) — every active F&O stock scanned; top-20 bullish / bearish ranked by score × proximity. Index/VIX regime bar, OI and HTF chips, ban list excluded from ranked lists.
- **Order Block Charts** (`/chart`) — search for an active F&O stock, then view order blocks, FVGs, liquidity pools, sweeps, BOS/CHoCH, EMA 20/50, trade plan, **option OI walls & max pain**, score breakdown, OI / HTF / regime / option-chain panels and a **per-stock backtest**. Interactive 2D charts use TradingView Lightweight Charts; the chart displays its required attribution.
- **Market X-Ray** (`/xray`) — full quant table with OI build-up, HTF alignment, reference index, OI walls, PCR, flags; filters + CSV export.
- **Scan diagnostics** — inspect scan/quote coverage, failed symbols, quote sample time, regime/calendar availability and candidate-level OI/options enrichment on the homepage, Liquidity Board, Trade Plans and Market X-Ray.
- **Methodology** — every rule and weight.

## The five institutional modules
| # | Module | Where |
|---|---|---|
| 1 | Walk-forward backtest + fitted logistic score (P[+1R before stop]) | `lib/backtest.ts`, `lib/fit.ts`, `lib/model.ts`, `scripts/backtest.ts` |
| 2 | Futures OI build-up (vs previous-session OI) | `lib/context.ts` → `classifyOi` |
| 3 | Higher-timeframe agreement + OB confluence | `lib/context.ts` → `htfSummary`, model feature `htfAlign` |
| 4 | NIFTY / BANK NIFTY regime (correlation-matched), India VIX, F&O ban, results dates | `lib/context.ts`, `lib/nse.ts` |
| 5 | Option-chain OI walls, PCR, max pain, ATM IV | `lib/upstox.ts` → `getOptionWalls` |

## Run locally
```bash
npm install
cp .env.example .env.local     # set your Upstox token
npm run dev
```

## Fit and evaluate the model (required before production use)
```bash
npm run backtest -- --tf 15m              # one timeframe (≈ 7 requests per stock)
npm run backtest -- --tf all              # all four timeframes (run at different times — rate limits)
npm run backtest -- --tf 15m --limit 50   # quick test on 50 stocks
```
When the data-quality checks pass, this writes `lib/model-weights.json` and a report in `reports/backtest-<tf>.md` (out-of-sample AUC, Brier, reliability table, and strategy hit-rate, expectancy, profit factor and drawdown). The chronological split keeps all trades with the same entry timestamp in one partition and purges training trades that have not exited before the test period. Full-sample results are labeled descriptive, not validation. Fitting is skipped unless at least 80% of requested symbols have 120 or more valid candles, there are 300 trades, and both outcomes have at least 10 examples in each split; skipped runs leave existing model weights unchanged.
Review the out-of-sample metrics, then commit the JSON and redeploy; the site badge switches to **Model fitted**. Fitting does not guarantee well-calibrated probabilities. Re-run monthly and compare the reported metrics before deploying new weights.

## Deploy on Vercel
1. Push to GitHub → import in Vercel.
2. Settings → Environment Variables → `UPSTOX_ACCESS_TOKEN`, `CRON_SECRET` (at least 32 characters), and `METHODOLOGY_PIN` (the four-digit access PIN; share it out of band). The PIN is required on each Methodology page load; failed attempts are rate-limited per instance and IP.
3. Deploy. Confirm your Vercel plan supports the `/api/scan` `maxDuration = 300` setting and configure an authenticated post-deploy warm-up.

## Rate limits & refresh (important)
Upstox allows **500 requests/min and 2,000 per 30 min per API**. Stoclio stays inside this by:
- sharing daily and intraday candle history, quotes, and derivatives data through Next.js Data Cache across server instances,
- refreshing today's 5-minute candles about every 4 minutes and patching the forming bar with the live price,
- one shared 4-second quote cache for all visitors,
- OI for the top 60 and option chains for the top 25 candidates per scan (10-minute cache).

The **first cold scan** downloads history for the whole universe and may take longer than five seconds. Upstream quota and visitor API limits are held in process memory, so they require no Redis service. On serverless deployments these limits are per running instance and reset when an instance restarts; use Vercel Firewall or another platform-level control if globally shared enforcement is required.

## Limitations
- Module adjustments (OI, regime, walls, results) are documented heuristics, not fitted — Upstox does not provide historical OI / option chains for a fair backtest.
- The offline backtest uses today's F&O list (survivorship bias).
- The results calendar comes from NSE's website and may be blocked from cloud IPs; the UI then shows "calendar unavailable".
- Prices are polled (5 s), not tick-by-tick; true ticks need the Upstox WebSocket on an always-on server.

## Security
Per-request nonce CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`), `X-Frame-Options: DENY`, HSTS preload, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP, `poweredByHeader` off. API: same-origin enforcement, strict input validation, no-store responses, per-instance in-memory rate limits, and provider token never sent to the browser.

## Speed (v7)
- **Edge caching:** `/api/scan`, `/api/top`, `/api/candles`, `/api/quotes` and `/api/universe` are cached on Vercel's edge with stale-while-revalidate. Visitors get the last result instantly while it refreshes in the background.
- **No waiting on the server:** once a scan exists, requests return it immediately and refresh it in the background (`waitUntil`).
- **Shared history:** daily and 5-minute history is stored in the Next.js Data Cache, so new server instances skip the slow history download.
- **One-request hero:** `/api/top` returns the #1 setup and its chart together, and the homepage preloads it before the page scripts run.
- **Warm-up:** `vercel.json` runs `/api/warm` at 09:10 and 15:20 IST on weekdays. Set `CRON_SECRET` in Vercel; it is sent automatically by Vercel Cron and is mandatory in production.
- After every new deployment the edge cache is cleared. Schedule an authenticated warm-up after deployment; a cold provider scan can exceed five seconds.

## Instant loading (v8)
- **Data in the first page load:** Home, Liquidity Board, Trade Plans, Market X-Ray and every chart page are rendered on the server with the latest data already included (`lib/snapshot.ts`), so there is no wait for a second request.
- **Shared snapshots:** the latest scan, the homepage hero and each chart are kept in the Next.js Data Cache, shared by all Vercel instances. New instances and new visitors get them immediately while a fresh copy is computed in the background.
- **Never block a page:** if a snapshot is not ready within about 0.5 s, the page is sent straight away with a skeleton and fills in as soon as data arrives.
- **Instant navigation:** one shared client store across pages, last-seen data remembered in the browser, a scan preloaded on idle, charts preloaded on hover or tap, other timeframes preloaded in the background, and `app/loading.tsx` for immediate page transitions.
- A five-second target applies to the application shell and warm cached responses. It cannot be guaranteed for a cold full-universe scan, a provider outage, or user-triggered backtests without changing the product’s data/compute architecture.

## Local environment
Copy `.env.example` to `.env.local` and set `UPSTOX_ACCESS_TOKEN`. Generate a unique, long random `CRON_SECRET` for deployments; never commit either value.
