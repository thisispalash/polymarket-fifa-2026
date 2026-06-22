/**
 * One-shot migration for the P1 + P2 hardening wave schema deltas.
 *
 * drizzle-kit push 0.28 errored with 42P16 ("column 'id' is in a primary
 * key") trying to alter unrelated PK columns. The changes we actually
 * need are mechanical, so we issue them directly with IF EXISTS / IF NOT
 * EXISTS so the script is idempotent.
 *
 *   P1 #9   — Drop fifa.positions_cache.side
 *   P1 #18  — Create fifa.sessions table
 *   P2 #31  — Composite indexes for cap accounting hot path
 *               strategy_executions(strategy_id, created_at)
 *               order_log(strategy_id, status)
 *
 * This script intentionally bypasses src/env.ts so it only needs
 * DATABASE_URL — running a schema migration shouldn't require the trading
 * secrets (PRIVATE_KEY, SESSION_SECRET).
 *
 * Run: cd server && bun run scripts/migrate-p1-hardening.ts
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

async function main(): Promise<void> {
  console.log("migrate: dropping fifa.positions_cache.side if present");
  await sql`ALTER TABLE fifa.positions_cache DROP COLUMN IF EXISTS side`;

  console.log("migrate: creating fifa.sessions if absent");
  await sql`
    CREATE TABLE IF NOT EXISTS fifa.sessions (
      id SERIAL PRIMARY KEY,
      token_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      last_used_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `;

  console.log("migrate: creating sessions_token_hash_unique index if absent");
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique
      ON fifa.sessions (token_hash)
  `;

  console.log("migrate: creating strategy_executions_strategy_time_idx if absent");
  await sql`
    CREATE INDEX IF NOT EXISTS strategy_executions_strategy_time_idx
      ON fifa.strategy_executions (strategy_id, created_at)
  `;

  console.log("migrate: creating order_log_strategy_status_idx if absent");
  await sql`
    CREATE INDEX IF NOT EXISTS order_log_strategy_status_idx
      ON fifa.order_log (strategy_id, status)
  `;

  console.log("migrate: adding fifa.order_log.client_order_id column if absent");
  await sql`
    ALTER TABLE fifa.order_log
      ADD COLUMN IF NOT EXISTS client_order_id TEXT
  `;

  console.log("migrate: creating order_log_client_order_id_unique partial index if absent");
  // Partial unique index — only enforces when the column is non-null, so
  // internal order paths that don't carry a key still insert freely.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS order_log_client_order_id_unique
      ON fifa.order_log (client_order_id)
      WHERE client_order_id IS NOT NULL
  `;

  console.log("migrate: hardening schema deltas applied");
}

main()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("migrate: failed", err);
    await sql.end().catch(() => undefined);
    process.exit(1);
  });
