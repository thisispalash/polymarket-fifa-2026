import { db } from "./client";
import { sql } from "drizzle-orm";

export type DbStatus = "healthy" | "schema_missing" | "db_unreachable";

export interface VerifyDbResult {
  ok: boolean;
  status: DbStatus;
  schemaPresent: boolean;
  tables: string[];
  error?: string;
}

export async function verifyDb(): Promise<VerifyDbResult> {
  try {
    await db.execute(sql`SELECT 1`);

    const schemaResult = await db.execute(
      sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.schemata
          WHERE schema_name = 'fifa'
        ) as exists
      `
    );

    const schemaPresent = (schemaResult[0] as { exists: boolean }).exists;

    if (!schemaPresent) {
      return {
        ok: false,
        status: "schema_missing",
        schemaPresent: false,
        tables: [],
        error: "fifa schema not found. Run `bun run db:push` from server/ to push the schema.",
      };
    }

    const tablesResult = await db.execute(
      sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'fifa'
        ORDER BY table_name
      `
    );

    const tables = (tablesResult as unknown as Array<{ table_name: string }>).map(
      (r) => r.table_name
    );

    if (tables.length === 0) {
      return {
        ok: false,
        status: "schema_missing",
        schemaPresent: true,
        tables: [],
        error: "fifa schema is empty. Run `bun run db:push` from server/ to push the tables.",
      };
    }

    return { ok: true, status: "healthy", schemaPresent: true, tables };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: "db_unreachable",
      schemaPresent: false,
      tables: [],
      error: `Database connection failed: ${message}`,
    };
  }
}

// Railway polls /healthz every ~10s. verifyDb fires three SELECTs (SELECT 1
// + two information_schema reads), which is wasted load once we know the
// schema is up. Cache the last good result for 5s so steady-state is one
// poll → one cache hit. The window stays short enough that an actual DB
// outage shows up within a single poll interval.
const CACHE_TTL_MS = 5_000;
let cached: { at: number; result: VerifyDbResult } | null = null;

export async function cachedVerifyDb(): Promise<VerifyDbResult> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.result;
  }
  const result = await verifyDb();
  // Don't cache failures — we want the next poll to retry immediately so
  // recovery shows up without waiting for the TTL to expire.
  if (result.ok) cached = { at: now, result };
  else cached = null;
  return result;
}
