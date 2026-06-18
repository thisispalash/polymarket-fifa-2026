import { eq, and, inArray } from "drizzle-orm";
import type { LimitLadderRule } from "@fifa/shared";
import { db } from "../db/client";
import { strategyRules, strategyConfigs, orderLog } from "../db/schema";
import { submitOrder, OrderRejected } from "../safety/submitOrder";
import {
  rungsNeedingPlacement,
  rungsNeedingTopUp,
  activeRungCount,
  withOrderId,
  withFilled,
} from "../strategies/limitLadder";
import { logger } from "../logger";
import type { WorkerDef } from "./runner";

async function run(): Promise<void> {
  const rules = await db
    .select({
      ruleId: strategyRules.id,
      strategyId: strategyRules.strategyId,
      rule: strategyRules.rule,
    })
    .from(strategyRules)
    .innerJoin(strategyConfigs, eq(strategyRules.strategyId, strategyConfigs.id))
    .where(
      and(
        eq(strategyRules.status, "active"),
        eq(strategyConfigs.kind, "limit_ladder"),
      ),
    );

  for (const row of rules) {
    try {
      await handleLadder(row.ruleId, row.strategyId, row.rule as LimitLadderRule);
    } catch (err) {
      logger.error({ ruleId: row.ruleId, err }, "ladderManage: per-rule error");
    }
  }
}

async function syncFilledRungs(
  ruleId: number,
  strategyId: number,
  rule: LimitLadderRule,
): Promise<LimitLadderRule> {
  // Collect all active orderIds from the current rule
  const orderIds = rule.rungs
    .map((r) => r.orderId)
    .filter((id): id is string => id !== undefined);

  if (orderIds.length === 0) return rule;

  const filledRows = await db
    .select({ orderId: orderLog.orderId })
    .from(orderLog)
    .where(
      and(
        inArray(orderLog.orderId, orderIds),
        eq(orderLog.status, "filled"),
      ),
    );

  const filledIds = new Set(filledRows.map((r) => r.orderId).filter((id): id is string => id !== null));

  let updated = rule;
  rule.rungs.forEach((rung, index) => {
    if (rung.orderId && filledIds.has(rung.orderId)) {
      updated = withFilled(updated, index);
      logger.info({ ruleId, orderId: rung.orderId }, "ladderManage: rung filled");
    }
  });

  return updated;
}

async function handleLadder(ruleId: number, strategyId: number, rule: LimitLadderRule): Promise<void> {
  // Step 1: sync fill status from orderLog
  let current = await syncFilledRungs(ruleId, strategyId, rule);

  // Step 2: place rungs needing placement (new + top-up), respecting maxActive cap
  const toPlace = [
    ...rungsNeedingPlacement(current),
    ...rungsNeedingTopUp(current),
  ];

  for (const { index, rung } of toPlace) {
    const active = activeRungCount(current);
    if (active >= current.maxActive) {
      logger.debug({ ruleId, active, maxActive: current.maxActive }, "ladderManage: maxActive cap reached");
      break;
    }

    try {
      const result = await submitOrder(
        {
          tokenId: current.tokenId,
          side: rung.side,
          type: "LIMIT",
          price: rung.price,
          size: rung.size,
          strategyId,
        },
        { strategyId },
      );
      current = withOrderId(current, index, result.orderId);
      logger.info({ ruleId, index, orderId: result.orderId, price: rung.price }, "ladderManage: rung placed");
    } catch (err) {
      if (err instanceof OrderRejected) {
        logger.warn({ ruleId, index, reason: err.message }, "ladderManage: order rejected");
      } else {
        throw err;
      }
    }
  }

  // Step 3: persist updated rule state
  await db
    .update(strategyRules)
    .set({ rule: current as unknown as Record<string, unknown> })
    .where(eq(strategyRules.id, ruleId));
}

export const ladderManageWorker: WorkerDef = {
  name: "ladderManage",
  intervalMs: 10_000,
  run,
};
