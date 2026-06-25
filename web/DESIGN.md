# Design

Visual system for the FIFA Trader PWA. Dark-first, instrument-grade. Tokens are
shadcn-style HSL channel triplets consumed via `hsl(var(--token))` in
`tailwind.config.js`; see `src/index.css` for the source of truth.

## Theme

Dark is the default and primary theme (`<html class="dark">`); a light theme
exists as a tuned fallback. The mood is a professional trading terminal in the
hand — deep tinted ink, near-white text, a single confident azure accent, and
green/red reserved strictly for money. Surfaces step up from the background by
lightness, not by heavy borders.

## Color

Format: HSL `H S% L%` (the value inside `hsl()`).

### Dark (default)

| Role | Token | Value | Notes |
|------|-------|-------|-------|
| Background | `--background` | `222 44% 6%` | deep blue-tinted ink |
| Foreground | `--foreground` | `210 36% 96%` | near-white, cool |
| Card / surface | `--card` | `222 38% 10%` | raised above bg |
| Popover | `--popover` | `222 40% 9%` | |
| Primary (accent) | `--primary` | `210 92% 56%` | azure; interactive/brand |
| Primary fg | `--primary-foreground` | `222 47% 8%` | |
| Muted | `--muted` | `222 26% 15%` | |
| Muted fg | `--muted-foreground` | `215 22% 68%` | bumped for AA on dark |
| Accent (hover) | `--accent` | `222 28% 18%` | |
| Border | `--border` | `220 24% 18%` | |
| Input | `--input` | `220 22% 20%` | |
| Ring (focus) | `--ring` | `210 92% 60%` | |
| Destructive | `--destructive` | `0 74% 60%` | |

### Semantic financial tokens

Centralized so money color is theme-aware and AA-legible. Never use raw
Tailwind `green-*` / `red-*` for financial or status values — use these.

| Role | Token (dark) | Token (light) | Usage |
|------|--------------|---------------|-------|
| Profit | `--profit` `146 64% 50%` | `142 71% 30%` | positive PnL, gains |
| Loss | `--loss` `2 80% 64%` | `0 72% 45%` | negative PnL |
| Success | `--success` `146 64% 48%` | `142 71% 33%` | healthy status, "all clear" |
| Danger | `--danger` `2 80% 64%` | `0 72% 45%` | failed status, kill-switch active |

Tailwind classes: `text-profit`, `text-loss`, `bg-success`, `text-danger`,
plus `/10` and `/30` opacities for tinted banners (e.g.
`bg-danger/10 border-danger/30`).

## Typography

System font stack (Tailwind default sans). Hierarchy is carried by weight and
size, not by family pairing.

- Page title (`h1`): `text-xl font-bold tracking-tight`
- Section / card title (`h2`): `text-sm font-semibold`
- Hero metric (portfolio value): `text-3xl font-bold tabular-nums tracking-tight`
- Body / list item: `text-sm`, secondary `text-xs`
- Micro labels: `text-[10px]` / `text-[11px]` (tab bar, stat captions)
- **All numbers use `tabular-nums`** so figures align and don't jitter on
  refresh.

## Layout

- **App shell** (`src/components/app-shell.tsx`): centered `max-w-2xl` reading
  column with a fixed bottom tab bar. Content padded
  `pb-[calc(env(safe-area-inset-bottom)+4.5rem)]` to clear the bar.
- **Bottom tab bar**: 6 destinations (Home, Markets, Portfolio, Arbs,
  Strategies, Settings), `h-14` items, lucide icon + `text-[10px]` label,
  active = `text-primary` with heavier stroke.
- **Page headers**: sticky, `bg-background/95 backdrop-blur border-b`, title
  only (navigation lives in the tab bar).
- **Spacing**: page gutter `px-4`, vertical rhythm `space-y-3`/`space-y-4`.
- **Safe areas**: `env(safe-area-inset-*)` respected at body, headers, sheets,
  and tab bar for iPhone PWA.
- **Radius**: `--radius: 0.75rem` (`rounded-xl` cards, `rounded-2xl` hero).
- Prefer one panel with internal hierarchy over grids of identical cards (see
  the portfolio hero).

## Components

- **Button** (`ui/button.tsx`): shadcn CVA variants (default/destructive/
  outline/secondary/ghost/link); `[&_svg]:size-4` for inline icons.
- **Switch** (`ui/switch.tsx`): Radix-backed; keyboard, visible focus ring,
  `aria-label` required. Used for strategy enable + auto-execute.
- **EmptyState** (`empty-state.tsx`): muted icon disc + title + optional
  description + action. Used on home/markets/portfolio/arbs.
- **Sheets**: bottom sheets via Radix Dialog (`max-w-2xl` centered), used for
  buy and sell. Slide + fade on open/close.
- **Sparkline** (`sparkline.tsx`): recharts line, `stroke="hsl(var(--primary))"`,
  no dots, no animation.
- **Icons**: `lucide-react` only — never Unicode glyphs.

## Motion

- Library: `tailwindcss-animate`. Sheets use
  `data-[state=open]:animate-in slide-in-from-bottom fade-in-0` (and the
  `out`/`slide-out-to-bottom` counterparts), `duration-300`.
- Tab and hover states: `transition-colors`.
- Easing: default ease-out; no bounce/elastic.
- **Reduced motion**: global `@media (prefers-reduced-motion: reduce)` in
  `index.css` collapses all animation/transition to ~0ms. Required for every
  new animation.

## Accessibility

WCAG 2.1 AA. Financial tokens are AA-tuned on both themes; focus is always
visible (`--ring`); custom controls carry real semantics and names; touch
targets ≥44px; color is never the only signal.
