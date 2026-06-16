# FIFA Trader

Mobile-first Polymarket trading dashboard for FIFA World Cup markets, with automated strategies running 24/7 in a backend worker.

See [SPEC.md](./SPEC.md) for design.

## Stack

- **Frontend**: Vite + React + TS + Tailwind + shadcn/ui + Recharts (PWA)
- **Backend**: Bun + Fastify + Drizzle ORM
- **DB**: Postgres (Railway)
- **Trading**: `@polymarket/clob-client-v2` + `viem`
- **Deploy**: Railway, single service

## Local dev

```bash
bun install                            # install all workspaces

cp .env.example .env                   # then fill in values
bun run db:push                        # apply schema to your DB

bun run dev                            # server + web together
# server: http://localhost:3000
# web:    http://localhost:5173
```

## Deploy

```bash
railway up                             # one service, Postgres add-on, region=eu-west2
```

Set env vars in Railway dashboard from `.env.example`.

## Repo layout

```
/server   Fastify API + worker (Bun)
/web      Vite + React PWA
/shared   Shared TS types
/drizzle  Generated DB migrations
```
