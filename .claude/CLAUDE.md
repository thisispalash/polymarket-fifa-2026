# FIFA Trader — workflow

A mobile-first Polymarket trading dashboard for the FIFA World Cup, with automated strategies running in a backend worker. See [SPEC.md](../SPEC.md) for design.

## Development loop

Default order for any non-trivial change:

1. **Strategy** — `/ce-strategy` to set or refine north-star direction. Output to `ce/strategy.md`.
2. **Plan** — `/ce-plan`, reading from [SPEC.md](../SPEC.md). Output to `ce/plan.md`. Plan includes already-done items so the source of truth stays unified.
3. **Execute** — `/subagent-driven-development`, working from `ce/plan.md`.
4. **Review** — `/ce-code-review` on the staged diff before each commit. May skip for trivial changes (typos, doc-only tweaks).

Strategy and plan are checked into `ce/`. Update them as scope evolves rather than re-inventing each session.

## Commit conventions

- **Every commit must update SPEC.md** alongside the code, flipping the relevant "Build progress" checkbox or section.
- **7-12 word subject line**, imperative mood, plus the Claude co-author trailer:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- **Small and topical** — one logical unit per commit. Never `git add -A`; stage by file path.
- **Don't skip hooks** (`--no-verify`) without explicit user permission.

## Interaction style

- Ask clarifying questions inline in chat (numbered list is fine). Do not use the structured question picker.
- No time-budget framing or descope-for-speed suggestions.
- Be concise; defer process talk in favor of just doing the work.

## Stack snapshot

- **Runtime**: Bun ≥ 1.3. Node 24+ semantics; no Node install required.
- **DB**: Postgres on Railway, schema `fifa`. Drizzle ORM. Migrations via `bun run db:push`.
- **Polymarket**: `@polymarket/client@beta` (the new unified TS SDK). The old `@polymarket/clob-client` is archived; do not use.
- **Server**: Fastify + in-process worker loops (portfolio sync, TP/SL, arb scan, ladder management, order reconcile).
- **Web**: Vite + React + Tailwind + shadcn/ui + Recharts. PWA via `vite-plugin-pwa`, installable on iPhone.
- **Deploy**: Railway, single service. Region: EU (Polymarket CLOB is geo-restricted to non-US).

## Sensitive surface

- The server holds the user's Polymarket EOA private key (`PRIVATE_KEY` env). This is intentional for a single-user personal app. Treat the server with the same care as a hot wallet.
- Sensitive routes are gated by `SESSION_SECRET` cookie. All trading endpoints sit behind it.
- Per-strategy capital cap and global kill-switch are non-optional safety rails.
