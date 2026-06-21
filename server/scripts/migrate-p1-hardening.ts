/**
 * One-shot migration for the P1 hardening wave schema deltas.
 *
 * drizzle-kit push 0.28 errored with 42P16 ("column 'id' is in a primary
 * key") trying to alter unrelated PK columns. The two changes we actually
 * need are mechanical, so we issue them directly with IF EXISTS / IF NOT
 * EXISTS so the script is idempotent.
 *
 *   1. Drop fifa.positions_cache.side  (P1 #9  — column was unused)
 *   2. Create fifa.sessions table       (P1 #18 — opaque session tokens)
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

  console.log("migrate: P1 hardening schema deltas applied");
}

main()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("migrate: failed", err);
    await sql.end().catch(() => undefined);
    process.exit(1);
  });
