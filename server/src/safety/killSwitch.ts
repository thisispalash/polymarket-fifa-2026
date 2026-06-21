import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { killSwitchState } from "../db/schema";
import { logger } from "../logger";

const MEMO_TTL_MS = 1_000;

let memo: { value: boolean; fetchedAt: number } | null = null;

export async function isKillSwitchEnabled(): Promise<boolean> {
  const now = Date.now();
  if (memo !== null && now - memo.fetchedAt < MEMO_TTL_MS) {
    return memo.value;
  }
  const rows = await db.select().from(killSwitchState).limit(1);
  const value = rows[0]?.enabled ?? false;
  memo = { value, fetchedAt: now };
  return value;
}

export async function setKillSwitch(
  enabled: boolean,
  reason?: string,
): Promise<void> {
  const now = new Date();
  const existing = await db.select().from(killSwitchState).limit(1);

  if (existing.length === 0) {
    await db.insert(killSwitchState).values({
      enabled,
      reason: enabled ? (reason ?? null) : null,
      triggeredAt: enabled ? now : null,
    });
  } else {
    const row = existing[0]!;
    // triggeredAt: clear on disable so the next enable stamps a fresh
    // moment-of-trigger. Preserving the old one made re-trigger timelines
    // forensically misleading.
    await db
      .update(killSwitchState)
      .set({
        enabled,
        reason: enabled ? (reason ?? row.reason) : null,
        triggeredAt: enabled ? (row.enabled ? row.triggeredAt : now) : null,
        updatedAt: now,
      })
      .where(eq(killSwitchState.id, row.id));
  }

  memo = null;
  logger.info({ enabled, reason }, "kill switch updated");
}
