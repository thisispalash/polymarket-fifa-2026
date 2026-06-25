# Product

## Register

product

## Users

A single power user — the developer/owner — trading Polymarket FIFA World Cup
markets from their phone. Context is glance-heavy and often in motion: checking
live prices during matches, reacting to arb opportunities, adjusting automated
strategy caps and kill switches between other things. The app is installed as a
PWA on an iPhone home screen and used in short, frequent, high-stakes bursts.

## Product Purpose

A mobile-first control surface for a personal Polymarket trading operation. It
surfaces live markets, the user's portfolio with real-time PnL, detected
arbitrage opportunities, and the controls for backend automation (per-strategy
capital caps, auto-execute toggles, and a global kill switch). Success is fast,
confident decisions: read a number correctly in a half-second glance, act on it
in one or two taps, and trust the safety rails. It is a cockpit, not a
storefront.

## Brand Personality

Precise, calm, instrument-grade. Three words: **sharp, trustworthy, quiet.**
The interface should feel like a professional trading terminal that happens to
fit in a hand — dense where it counts, never noisy. It earns trust by making the
money legible and the dangerous actions deliberate. No hype, no celebration, no
decoration that doesn't carry information.

## Anti-references

- **Generic shadcn-starter blankness** — the untouched slate template with no
  decisions made (the state this app started in). Identity must be committed.
- **Crypto/degen maximalism** — neon gradients, glassmorphism, animated glow,
  confetti on wins. This handles real money; it should feel sober.
- **Consumer fintech cheeriness** (Robinhood-style) — oversized illustrations,
  playful empty states, gamified nudges. The user is an operator, not a
  retail dabbler being onboarded.
- **Dashboard card-soup** — endless identical bordered cards in a grid with no
  hierarchy.

## Design Principles

1. **The number is the product.** Financial values get the strongest contrast,
   tabular figures, and the top of the hierarchy. Profit/loss color is semantic
   and AA-legible, never decorative.
2. **Glanceable in a half-second.** Dark-first, high-contrast, one accent.
   Optimize for the in-hand quick check during a live match.
3. **Dangerous actions are deliberate.** Kill switch, order submission, and arb
   execution use confirmation steps and destructive styling. Safety rails are
   non-optional and visible.
4. **Reach everything from everywhere.** Persistent navigation; no orphaned
   screens, no detours through Home.
5. **Decisions, not defaults.** Every color, weight, and spacing choice is
   intentional. If it looks like a template, it's wrong.

## Accessibility & Inclusion

Target WCAG 2.1 AA. Body and financial text meet ≥4.5:1 contrast; the
profit/loss/success/danger tokens are tuned to clear AA on both themes. All
interactive controls are keyboard operable with visible focus, custom toggles
use real semantics (Radix Switch) with accessible names, icons are labeled or
`aria-hidden` with adjacent text, and touch targets are ≥44px. A global
`prefers-reduced-motion` guard reduces all animation to near-instant. Color is
never the sole signal (PnL also carries +/− and sign; status carries text).
