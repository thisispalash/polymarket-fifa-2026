import { lt } from "drizzle-orm";
import { db } from "../db/client";
import { sessions } from "../db/schema";
import { logger } from "../logger";
import type { WorkerDef } from "./runner";

// Idle-session TTL. Sessions whose lastUsedAt falls outside this window
// are deleted on the next sweep; the user is forced through /unlock
// again. Single-user app — long enough that the operator's phone stays
// signed in across a workday, short enough that a stolen device on the
// dresser doesn't keep trading access forever.
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1_000;

async function run(): Promise<void> {
  const cutoff = new Date(Date.now() - SESSION_TTL_MS);
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.lastUsedAt, cutoff))
    .returning({ id: sessions.id });
  if (deleted.length > 0) {
    logger.info({ deleted: deleted.length, cutoff }, "sessionSweep: expired sessions removed");
  }
}

// Hourly cadence is plenty for a 14-day TTL; a missed sweep just means a
// few hours of dead rows linger, not a security issue.
export const sessionSweepWorker: WorkerDef = {
  name: "sessionSweep",
  intervalMs: 60 * 60 * 1_000,
  run,
};
