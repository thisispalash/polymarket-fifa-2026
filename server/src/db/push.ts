import { verifyDb } from "./health";
import { logger } from "../logger";

// Re-export so existing imports keep working until callers migrate.
export { verifyDb };
export type { DbStatus, VerifyDbResult } from "./health";

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
