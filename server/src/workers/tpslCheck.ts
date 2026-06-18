import { eq, and } from "drizzle-orm";
import type { TpSlRule } from "@fifa/shared";
import { db } from "../db/client";
import { strategyRules, strategyConfigs, positionsCache } from "../db/schema";
import { submitOrder, OrderRejected } from "../safety/submitOrder";
import { shouldFire, buildSellOrder } from "../strategies/tpsl";
import { logger } from "../logger";
import type { WorkerDef } from "./runner";

const STALE_MS = 60_000;

async function run(): Promise<void> {
  const rules = await db
    .select({
      ruleId: strategyRules.id,
      strategyId: strategyRules.strategyId,
      tokenId: strategyRules.tokenId,
      rule: strategyRules.rule,
      kind: strategyConfigs.kind,
    })
    .from(strategyRules)
    .innerJoin(strategyConfigs, eq(strategyRules.strategyId, strategyConfigs.id))
    .where(eq(strategyRules.status, "active"));

  for (const row of rules) {
    try {
      if (row.kind === "tp_sl") {
        await handleTpSl(row);
      }
    } catch (err) {
      logger.error({ ruleId: row.ruleId, err }, "tpslCheck: per-rule error");
    }
  }
}

interface RuleRow {
  ruleId: number;
  strategyId: number;
  tokenId: string | null;
  rule: Record<string, unknown>;
  kind: string;
}

async function getPosition(tokenId: string | null) {
  if (!tokenId) return null;
  const [pos] = await db
    .select()
    .from(positionsCache)
    .where(eq(positionsCache.tokenId, tokenId))
    .limit(1);
  if (!pos) return null;
  const age = Date.now() - pos.updatedAt.getTime();
  if (age > STALE_MS) {
    logger.warn({ tokenId, ageMs: age }, "tpslCheck: stale price, skipping");
    return null;
  }
  return pos;
}

async function handleTpSl(row: RuleRow): Promise<void> {
  const rule = row.rule as TpSlRule & { tokenId?: string };
  const tokenId = row.tokenId ?? rule.tokenId ?? null;
  const pos = await getPosition(tokenId);
  if (!pos) return;

  const trigger = shouldFire(rule, pos.currentPrice);
  if (!trigger) return;

  try {
    await submitOrder(
      buildSellOrder(rule, pos, trigger),
      { strategyId: row.strategyId },
    );
  } catch (err) {
    if (err instanceof OrderRejected) {
      logger.warn({ ruleId: row.ruleId, reason: err.message }, "tpslCheck: order rejected");
      return;
    }
    throw err;
  }

  await db
    .update(strategyRules)
    .set({ status: "consumed", lastFiredAt: new Date() })
    .where(eq(strategyRules.id, row.ruleId));
  logger.info({ ruleId: row.ruleId, trigger }, "tpslCheck: tp_sl fired");
}

export { getPosition };
export type { RuleRow };

export const tpslCheckWorker: WorkerDef = {
  name: "tpslCheck",
  intervalMs: 5_000,
  run,
};
