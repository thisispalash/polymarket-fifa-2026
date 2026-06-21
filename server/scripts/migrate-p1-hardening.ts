/**
 * One-shot migration for the P1 hardening wave schema deltas.
 *
 * drizzle-kit push 0.28 errors out trying to re-alter unrelated PK columns
 * ("column 'id' is in a primary key", 42P16). The two changes we actually
 * need are mechanical, so we issue them directly with IF EXISTS / IF NOT
 * EXISTS so the script is idempotent.
 *
 *   1. Drop fifa.positions_cache.side  (P1 #9 — column was unused)
 *   2. Create fifa.sessions table       (P1 #18 — opaque session tokens)
 *
 * Run: cd server && bun run scripts/migrate-p1-hardening.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { logger } from "../src/logger";

async function main(): Promise<void> {
  logger.info("migrate: dropping fifa.positions_cache.side if present");
  await db.execute(sql`ALTER TABLE fifa.positions_cache DROP COLUMN IF EXISTS side`);

  logger.info("migrate: creating fifa.sessions if absent");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fifa.sessions (
      id SERIAL PRIMARY KEY,
      token_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      last_used_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `);

  logger.info("migrate: creating sessions_token_hash_unique index if absent");
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique
      ON fifa.sessions (token_hash)
  `);

  logger.info("migrate: P1 hardening schema deltas applied");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "migrate: failed");
    process.exit(1);
  });
