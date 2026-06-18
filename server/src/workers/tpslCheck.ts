import { eq, and } from "drizzle-orm";
import type { TpSlRule, TrailingStopRule, ScaleOutRule } from "@fifa/shared";
import { db } from "../db/client";
import { strategyRules, strategyConfigs, positionsCache } from "../db/schema";
import { submitOrder, OrderRejected } from "../safety/submitOrder";
import { shouldFire, buildSellOrder } from "../strategies/tpsl";
import { tick as trailingStopTick } from "../strategies/trailingStop";
import { checkLegs } from "../strategies/scaleOut";
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
      } else if (row.kind === "trailing_stop") {
        await handleTrailingStop(row);
      } else if (row.kind === "scale_out") {
        await handleScaleOut(row);
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

async function handleTrailingStop(row: RuleRow): Promise<void> {
  const rule = row.rule as TrailingStopRule & { tokenId?: string };
  const tokenId = row.tokenId ?? rule.tokenId ?? null;
  const pos = await getPosition(tokenId);
  if (!pos) return;

  const { updatedRule, fire } = trailingStopTick(rule, pos.currentPrice);

  if (fire) {
    try {
      await submitOrder(
        { tokenId: pos.tokenId, side: "SELL", type: "MARKET", size: pos.shares },
        { strategyId: row.strategyId },
      );
    } catch (err) {
      if (err instanceof OrderRejected) {
        logger.warn({ ruleId: row.ruleId, reason: err.message }, "tpslCheck: trailing_stop order rejected");
        return;
      }
      throw err;
    }
    await db
      .update(strategyRules)
      .set({ status: "consumed", lastFiredAt: new Date(), rule: updatedRule as unknown as Record<string, unknown> })
      .where(eq(strategyRules.id, row.ruleId));
    logger.info({ ruleId: row.ruleId }, "tpslCheck: trailing_stop fired");
  } else {
    await db
      .update(strategyRules)
      .set({ rule: updatedRule as unknown as Record<string, unknown> })
      .where(eq(strategyRules.id, row.ruleId));
  }
}

async function handleScaleOut(row: RuleRow): Promise<void> {
  const rule = row.rule as ScaleOutRule & { tokenId?: string };
  const tokenId = row.tokenId ?? rule.tokenId ?? null;
  const pos = await getPosition(tokenId);
  if (!pos) return;

  const { firingLegs, updatedRule } = checkLegs(rule, pos.currentPrice, pos.shares);

  for (const leg of firingLegs) {
    try {
      await submitOrder(
        { tokenId: pos.tokenId, side: "SELL", type: "MARKET", size: leg.size },
        { strategyId: row.strategyId },
      );
      logger.info({ ruleId: row.ruleId, legIndex: leg.index, size: leg.size }, "tpslCheck: scale_out leg fired");
    } catch (err) {
      if (err instanceof OrderRejected) {
        logger.warn({ ruleId: row.ruleId, legIndex: leg.index, reason: err.message }, "tpslCheck: scale_out order rejected");
      } else {
        throw err;
      }
    }
  }

  await db
    .update(strategyRules)
    .set({ rule: updatedRule as unknown as Record<string, unknown> })
    .where(eq(strategyRules.id, row.ruleId));
}

export { getPosition };
export type { RuleRow };

export const tpslCheckWorker: WorkerDef = {
  name: "tpslCheck",
  intervalMs: 5_000,
  run,
};
