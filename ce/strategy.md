---
name: FIFA Trader
last_updated: 2026-06-16
---

# FIFA Trader Strategy

## Target problem

You're trading Polymarket FIFA World Cup markets from your phone during a 32-team tournament that runs across timezones for ~30 days. The native UI surfaces no guaranteed-profit opportunities, has no unattended position management, and takes multiple taps per order — so you miss arb windows that close in seconds, get stopped out by drift you didn't see, and react slowly during the volatile minutes around goals.

## Our approach

Bet on **automation that runs without you, paired with one-tap UX that runs with you.** A backend worker holds your private key and watches markets 24/7 — scanning for arbs, firing TP/SL, managing ladders. A mobile PWA collapses every common manual action into a single tap. The combination is the bet: most Polymarket assistants pick automation OR UX; this one commits to both, with intentional server-side key custody as the price of admission.

## Who it's for

**Primary:** Solo personal trader (you). Hiring FIFA Trader to (a) capture every Dutch-arb opportunity the World Cup throws off without watching screens, (b) bank profits and stop losses on positions while sleeping, traveling, or in meetings, and (c) make every manual phone action a single tap during the live volatile minutes.

## Key metrics

- **Arb capture rate** — Dutch + YES/NO opportunities executed / detected during the tournament. Measured from `arb_opportunities` + `strategy_executions` tables.
- **Realized arb PnL** — $ profit from strategies 1 + 3 over the tournament. From `strategy_executions.pnl`.
- **Rule fire correctness** — % of TP/SL/trailing-stop/scale-out rule triggers that fired within 30s of the price condition becoming true. Watch for misses, not hits.
- **One-tap latency** — p95 wall-clock from tap to "order submitted" confirmation on the phone. Target < 2s. Measured client-side.
- **Worker uptime during match hours** — % of FIFA match-window minutes with all worker loops healthy. Target ≥ 99.5%.

## Tracks

### Edge engine

Dutch arbitrage and YES/NO arbitrage — continuous scanners that compute outcome-price sums, surface opportunities, compute stake splits, and (optionally) auto-execute within capital caps.

_Why it serves the approach:_ This is the headline "make money whatever the outcome" feature. Without it, the product is a polished UI on top of Polymarket; with it, the product earns its own keep.

### Position management

TP/SL, trailing stop, scale-out / partial TP, limit-order ladders — rule-based automation that handles open positions when the user isn't looking.

_Why it serves the approach:_ Delivers the "runs without you" half of the bet. Lets the user open positions and walk away without sweating the live tape.

### Mobile fluency

PWA UX — installable on the phone home screen, watchlist as home, portfolio with one-tap sell, market detail with sparklines, strategy control panel sized for thumbs.

_Why it serves the approach:_ Delivers the "runs with you" half. The product is on your phone during matches, and every common move should be one tap.

### Safety rails

Per-strategy capital caps, global kill switch, full audit log of every order, session-secret unlock gate, and the wallet's own balance as the natural blast-radius cap.

_Why it serves the approach:_ Makes 24/7 server-side private-key custody palatable. Without these, the automation bet is reckless; with them, it's calculated.

## Not working on

- News / event-driven strategies (no goal-feed data source wired)
- Mean-reversion / vol-based strategies (deferred; same plumbing, additive)
- Multi-user / auth (single-user app)
- Push notifications to phone (deferred; in-app polling is enough during matches)
- Charts beyond sparklines (full TradingView-style charting is out of scope)
