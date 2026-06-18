# Polymarket FIFA Trading App — Spec

A personal, mobile-first trading dashboard for Polymarket FIFA World Cup markets, with automated strategies running 24/7 in a backend worker.

## Build progress

Legend: `[x]` done · `[~]` in progress · `[ ]` pending

**Foundations**
- [x] Root workspace config (package.json, tsconfig, env, gitignore, README)
- [x] Shared types package
- [x] Server package scaffold (env, logger, drizzle config)
- [x] DB schema authored
- [x] Bun install + lockfile committed
- [x] Drizzle schema pushed to Railway Postgres
- [x] Polymarket CLOB client + L1→L2 bootstrap
- [x] Session-secret unlock gate

**Backend routes**
- [x] `/markets` + `/markets/:id`
- [x] `/watchlist` (add/remove/list)
- [x] `/portfolio` (positions + balances + PnL)
- [x] `/orders` (submit + cancel)
- [x] `/strategies` (list, toggle, allocate)
- [x] `/strategies/:id/rules` (CRUD)
- [x] `/arb/opportunities` + `/arb/execute`
- [x] `/kill-switch`

**Worker loops**
- [x] `portfolioSync` (5s)
- [x] `tpslCheck` (5s)
- [x] `arbScan` (10s)
- [x] `ladderManage` (10s)
- [x] `orderReconcile` (15s)

**Strategies**
- [x] Dutch arbitrage scanner + executor (priority)
- [x] YES/NO arbitrage scanner + executor
- [x] Take-profit / Stop-loss
- [x] Trailing stop
- [x] Scale-out / partial TP
- [x] Limit-order ladders

**UI (mobile-first)**
- [x] Vite + React + Tailwind + shadcn scaffold
- [x] PWA manifest + service worker
- [x] Home / Watchlist
- [x] Markets list + Market detail
- [x] Portfolio + one-tap sell sheet
- [x] Strategies control panel
- [x] Arbs page
- [x] Settings (kill switch, env health)
- [x] Recharts sparklines on watchlist + detail

**Deploy**
- [x] Railway service + Postgres add-on
- [x] env vars set + region pinned EU
- [x] PWA installable on phone

**Process docs**
- [x] `.claude/CLAUDE.md` workflow guidance
- [x] `ce/strategy.md` (anchor doc; rerun via `/ce-strategy`)
- [x] `ce/plan.md` (via `/ce-plan`)

## Scope

- **Single-user** to start (the developer). Multi-user is a future option but no auth in v1.
- Read + **full trading** via Polymarket CLOB API.
- Strategies run as in-process workers; user toggles them on/off, allocates capital per strategy.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React 18 + TypeScript + Tailwind + shadcn/ui + Recharts + `vite-plugin-pwa` |
| Backend | Bun 1.3+ + Fastify + TypeScript |
| Trading worker | Same Bun process; `setInterval` loops + an internal job queue |
| DB | Postgres + Drizzle ORM (Railway add-on) |
| Polymarket SDK | `@polymarket/client@beta` (new unified SDK) + `viem` |
| Deploy | Railway, single service. Region: EU (matches Polymarket's eu-west-2 georestriction). |

Repo layout:
```
/server   Fastify API + worker
/web      Vite + React PWA
/shared   Shared TS types (market, position, order, strategy)
```

## Auth & wallet model

- **Server holds the EOA private key** in env (`PRIVATE_KEY`). User accepts the risk; this is a personal app.
- On first boot, server uses `@polymarket/client` to derive L2 creds (API key + secret + passphrase) from the private key, then persists them in DB so they survive restarts.
- Funds live in Polymarket's **proxy wallet** controlled by the EOA — the SDK handles the indirection.
- Frontend has **no wallet code** — all calls go through the backend.
- Sensitive routes are gated by a single env-var secret (`SESSION_SECRET`); user enters it once at `/unlock`, server sets an HttpOnly cookie.

## Features

### 1. Market browser & watchlist
- List all live FIFA World Cup markets (filter by stage, team, market type).
- Each row shows: question, current YES/NO mid-price, 24h change, volume, expiry.
- Star → adds to watchlist (Postgres-backed). Watchlist is the home screen.

### 2. Portfolio dashboard
- All open positions: market, side (YES/NO), shares, avg cost, current mark, unrealized PnL ($ + %).
- Total exposure, total unrealized PnL, available USDC.
- **One-tap sell** on each position: opens a sheet with "Sell at market" / "Sell at limit X" / "Sell 25/50/100%".
- Trade history (closed positions) with realized PnL.

### 3. TP/SL engine (Strategy #4)
- Per-position rules: take-profit at price ≥ X, stop-loss at price ≤ Y.
- Worker polls portfolio + best-bid prices every 5s; when triggered, submits a market sell (or limit at trigger price ± slippage).
- One-shot (consumed on fire) by default; togglable to "trailing".

### 4. Trailing stop (Strategy #5)
- Stop price ratchets up as mark hits new highs (configurable ratchet step, e.g. "trail by 5%").
- Same worker as TP/SL; stored as a different rule type.

### 5. Dutch arbitrage scanner & executor (Strategy #1, **priority**)
- For each multi-outcome market (e.g. "Who wins the World Cup?"), continuously compute `sum(best_ask_i)` across all outcomes.
- If sum < 1.00 minus a configurable margin (default 1%) AND book depth is sufficient at those prices, flag as opportunity.
- Stake-splitter computes share counts per outcome that lock in equal profit regardless of winner.
- UI shows opportunity card with: expected $ profit, required capital, per-outcome stakes, "Execute" button.
- Auto-execute toggle (off by default): if on, fires within `MAX_AUTO_STAKE` per opportunity.

### 6. YES/NO arb scanner (Strategy #3)
- Within a binary market, watch for `best_ask_YES + best_ask_NO < 1.00`.
- Same execution path as Dutch arb (binary case = 2 outcomes).
- Scanner runs continuously, surfaces opportunities, supports both manual execute and auto-execute (per-strategy toggle + capital cap).

### 7. Scale-out / partial TP (Strategy #6)
- Per-position rule of the form `[{pct: 25, atPrice: 0.40}, {pct: 25, atPrice: 0.60}, {pct: 50, atPrice: 0.80}]`.
- Each leg fires independently when mark crosses its trigger; consumed legs are flagged so they don't refire.
- Shares the TP/SL polling loop; rule rows carry a `legs` jsonb column with consumed state.

### 8. Limit-order ladders (Strategy #7)
- Place a grid of resting bids (or asks) at configurable price levels and size per level for a chosen market.
- "Top-up" mode: when a rung fills, optionally re-place at the same level. Configurable max active rungs to cap exposure.
- Cancel-all button per ladder; ladder lifecycle stored so worker can replace fills.

### 9. Strategy control panel
- Per-strategy: on/off toggle, allocated capital cap, per-strategy realized PnL, kill-switch (cancels all open orders for that strategy).
- Global kill-switch: cancels all open orders and disables all strategies.

## Data model (Drizzle)

```ts
clob_credentials    // id, api_key, api_secret, passphrase, created_at
watchlist           // id, market_id, slug, added_at
positions_cache     // mirror of Polymarket positions for offline UI (refreshed every 5s)
strategy_configs    // id, kind, enabled, capital_cap, params jsonb, created_at
strategy_rules      // id, strategy_id, market_id, rule jsonb, status, last_fired_at
strategy_executions // id, strategy_id, rule_id, market_id, side, price, size, order_id, pnl, created_at
arb_opportunities   // id, market_id, sum_price, edge_pct, stakes jsonb, detected_at, executed bool
order_log           // every order we submit + response (audit trail)
```

## Backend API (Fastify)

```
POST /unlock                       — submit session secret, set cookie
GET  /markets                      — list FIFA markets
GET  /markets/:id                  — single market detail + orderbook
GET  /watchlist                    — user watchlist
POST /watchlist/:marketId          — add/remove
GET  /portfolio                    — positions + balances + PnL
POST /orders                       — submit order (buy/sell, market/limit, side, size)
DELETE /orders/:orderId            — cancel
GET  /strategies                   — list w/ status + PnL
POST /strategies/:id/toggle        — enable/disable
POST /strategies/:id/allocate      — set capital cap
GET  /strategies/:id/rules         — per-position rules
POST /strategies/:id/rules         — create rule
DELETE /strategies/:id/rules/:rid  — delete rule
GET  /arb/opportunities            — current Dutch / YES-NO arb opps
POST /arb/execute/:oppId           — execute a flagged opp
POST /kill-switch                  — cancel everything, disable all
```

## Worker loops (in-process, single Node)

| Loop | Interval | Job |
|---|---|---|
| `portfolioSync` | 5s | Refresh positions, balances, mark prices |
| `tpslCheck` | 5s | Walk active rules; fire orders on trigger |
| `arbScan` | 10s | For each multi-outcome market in watchlist + top-N markets: compute `sum(best_ask)`, flag if < threshold. Also scans binary markets for YES/NO arb. |
| `ladderManage` | 10s | For each active ladder: place missing rungs, refill filled rungs if top-up is on, enforce max-active-rungs cap |
| `orderReconcile` | 15s | Reconcile our `order_log` with Polymarket's order state; mark filled/cancelled/expired |

All loops use a shared `submitOrder()` that enforces per-strategy capital caps and the global kill-switch.

## UI pages (mobile-first)

1. **Home** — watchlist with live prices, quick links to portfolio + arbs
2. **Markets** — searchable market list, filter chips
3. **Market detail** — orderbook, price chart, buy/sell sheet
4. **Portfolio** — positions + sells + history
5. **Strategies** — per-strategy cards with toggle/allocate/PnL
6. **Arbs** — flagged Dutch + YES/NO opportunities, "Execute" button
7. **Settings** — env health, kill switch, clear cache

PWA: manifest + service worker, installable on iPhone home screen.

## Env vars

```
DATABASE_URL=postgresql://...
PRIVATE_KEY=0x...                     # Polymarket EOA private key
SESSION_SECRET=...                    # gate for /unlock
CLOB_HOST=https://clob.polymarket.com
GAMMA_HOST=https://gamma-api.polymarket.com
PORT=3000
LOG_LEVEL=info
```

## Non-goals (v1)

- Multi-user / auth
- Mobile push notifications (no price alerts per user)
- News/event-driven strategies
- Charts beyond a simple sparkline
- Mean-reversion / vol-based strategies (#8) — additive later
- **Conversational AI copilot + generative UI** — deferred to v2 (2026-06-17 decision; chat-driven multi-leg volatility playbooks with a constrained component palette)
