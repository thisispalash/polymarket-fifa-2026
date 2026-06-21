import { db } from "./client";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

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
    // Test basic connectivity
    await db.execute(sql`SELECT 1`);

    // Check if schema exists
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

    // List all tables in the fifa schema
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

    return {
      ok: true,
      status: "healthy",
      schemaPresent: true,
      tables,
    };
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

if (import.meta.main) {
  (async () => {
    const result = await verifyDb();

    if (result.ok) {
      logger.info(
        {
          schemaPresent: result.schemaPresent,
          tableCount: result.tables.length,
          tables: result.tables,
        },
        "db verified"
      );
      process.exit(0);
    } else {
      logger.error(
        {
          schemaPresent: result.schemaPresent,
          error: result.error,
        },
        "db verification failed"
      );
      if (result.error?.includes("not found")) {
        logger.warn("run `bun run db:push` from server/ to push the schema");
      }
      process.exit(1);
    }
  })();
}
