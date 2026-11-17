# Stoclio — Institutional Order Block & Liquidity Platform (NSE F&O)

Next.js 14 full-stack app. No database, no login. Live data from Upstox.

## What's inside
- **Liquidity Board** (`/board`) — every active F&O stock scanned; top-20 bullish / bearish ranked by score × proximity. Index/VIX regime bar, OI and HTF chips, ban list excluded.
- **Order Block Charts** (`/chart/SBIN`) — order blocks, FVGs, liquidity pools, sweeps, BOS/CHoCH, EMA 20/50, trade plan, **option OI walls & max pain**, score breakdown, OI / HTF / regime / option-chain panels and a **per-stock backtest**.
- **Market X-Ray** (`/xray`) — full quant table with OI build-up, HTF alignment, reference index, OI walls, PCR, flags; filters + CSV export.
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
cp .env.example .env.local     # paste your Upstox token
npm run dev
```

## Calibrate the model (recommended before going live)
```bash
npm run backtest -- --tf 15m              # one timeframe (≈ 6 requests per stock)
npm run backtest -- --tf all              # all four timeframes (run at different times — rate limits)
npm run backtest -- --tf 15m --limit 50   # quick test on 50 stocks
```
This writes `lib/model-weights.json` and a report in `reports/backtest-<tf>.md` (out-of-sample AUC, Brier, calibration table, hit-rate, expectancy, profit factor, drawdown).
Commit the JSON and redeploy; the site badge switches from **Model uncalibrated** to **Model calibrated**. Re-run monthly.

## Deploy on Vercel
1. Push to GitHub → import in Vercel.
2. Settings → Environment Variables → `UPSTOX_ACCESS_TOKEN`.
3. Deploy. `/api/scan` uses `maxDuration = 300` (Vercel Fluid compute; Hobby supports up to 300 s).

## Rate limits & refresh (important)
Upstox allows **500 requests/min and 2,000 per 30 min per API**. Stoclio stays inside this by:
- caching candle history per day (5-minute history serves 5m / 15m / 1H; daily serves 1D / weekly),
- refreshing today's 5-minute candles about every 4 minutes and patching the forming bar with the live price,
- one shared 4-second quote cache for all visitors,
- OI for the top 60 and option chains for the top 25 candidates per scan (10-minute cache).

The **first scan of each day** downloads history for the whole universe and takes **about 1–2 minutes**. The limiter is per server instance.

## Limitations
- Module adjustments (OI, regime, walls, results) are documented heuristics, not fitted — Upstox does not provide historical OI / option chains for a fair backtest.
- The offline backtest uses today's F&O list (survivorship bias).
- The results calendar comes from NSE's website and may be blocked from cloud IPs; the UI then shows "calendar unavailable".
- Prices are polled (5 s), not tick-by-tick; true ticks need the Upstox WebSocket on an always-on server.

## Security
Per-request nonce CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`), `X-Frame-Options: DENY`, HSTS preload, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP, `poweredByHeader` off. API: same-origin enforcement, per-IP rate limit, strict input validation, `no-store`, token never sent to the browser.

## Speed (v7)
- **Edge caching:** `/api/scan`, `/api/top`, `/api/candles`, `/api/quotes` and `/api/universe` are cached on Vercel's edge with stale-while-revalidate. Visitors get the last result instantly while it refreshes in the background.
- **No waiting on the server:** once a scan exists, requests return it immediately and refresh it in the background (`waitUntil`).
- **Shared history:** daily and 5-minute history is stored in the Next.js Data Cache, so new server instances skip the slow history download.
- **One-request hero:** `/api/top` returns the #1 setup and its chart together, and the homepage preloads it before the page scripts run.
- **Warm-up:** `vercel.json` runs `/api/warm` at 09:10 and 15:20 IST on weekdays, so scans are ready before visitors arrive. Optionally set `CRON_SECRET` in Vercel; it is sent automatically by Vercel Cron.
- After every new deployment the edge cache is cleared, so the very first visit after a deploy can still take about a minute. Open `/api/warm` once after deploying to pre-load it.

## Instant loading (v8)
- **Data in the first page load:** Home, Liquidity Board, Trade Plans, Market X-Ray and every chart page are rendered on the server with the latest data already included (`lib/snapshot.ts`), so there is no wait for a second request.
- **Shared snapshots:** the latest scan, the homepage hero and each chart are kept in the Next.js Data Cache, shared by all Vercel instances. New instances and new visitors get them immediately while a fresh copy is computed in the background.
- **Never block a page:** if a snapshot is not ready within about 0.5 s, the page is sent straight away with a skeleton and fills in as soon as data arrives.
- **Instant navigation:** one shared client store across pages, last-seen data remembered in the browser, a scan preloaded on idle, charts preloaded on hover or tap, other timeframes preloaded in the background, and `app/loading.tsx` for immediate page transitions.
- **Only remaining wait:** the very first scan after a new deployment. Open `/api/warm` once after each deploy.
