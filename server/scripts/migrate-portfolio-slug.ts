/**
 * One-shot migration: add fifa.positions_cache.slug.
 *
 * The wallet position payload carries no Gamma market id, only a
 * conditionId + slug. The portfolio links to market detail by slug
 * (getMarketDetail resolves id-or-slug), so the cache needs a slug column.
 *
 * Issued as a direct ALTER (not drizzle-kit push) for the same reason as
 * migrate-p1-hardening.ts: push 0.28 chokes on unrelated PK columns. IF NOT
 * EXISTS keeps it idempotent. Bypasses src/env.ts so it only needs
 * DATABASE_URL, not the trading secrets.
 *
 * Run: cd server && bun run scripts/migrate-portfolio-slug.ts
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

async function main(): Promise<void> {
  console.log("migrate: adding fifa.positions_cache.slug column if absent");
  await sql`
    ALTER TABLE fifa.positions_cache
      ADD COLUMN IF NOT EXISTS slug TEXT NOT NULL DEFAULT ''
  `;
  console.log("migrate: positions_cache.slug applied");
}

main()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("migrate: failed", err);
    await sql.end().catch(() => undefined);
    process.exit(1);
  });
