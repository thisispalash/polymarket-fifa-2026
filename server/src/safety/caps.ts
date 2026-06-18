import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { strategyConfigs, strategyExecutions } from "../db/schema";

const CAP_WINDOW_MS = 24 * 60 * 60 * 1_000;

export class OrderRejected extends Error {
  readonly reason: "cap_breach" | "kill_switch";
  readonly meta: Record<string, unknown>;
  constructor(reason: "cap_breach" | "kill_switch", meta: Record<string, unknown> = {}) {
    super(`Order rejected: ${reason}`);
    this.name = "OrderRejected";
    this.reason = reason;
    this.meta = meta;
  }
}

export function wouldBreachCap(sumSpent: number, cap: number, costUsdc: number): boolean {
  return sumSpent + costUsdc > cap;
}

export async function assertWithinCap(strategyId: number, costUsdc: number): Promise<void> {
  const cfgRows = await db
    .select({ capitalCap: strategyConfigs.capitalCap })
    .from(strategyConfigs)
    .where(eq(strategyConfigs.id, strategyId))
    .limit(1);

  const cap = cfgRows[0]?.capitalCap ?? 0;
  const windowStart = new Date(Date.now() - CAP_WINDOW_MS);

  const spendRows = await db
    .select({ sumSpent: sql<number>`coalesce(sum(size * price), 0)` })
    .from(strategyExecutions)
    .where(
      and(
        eq(strategyExecutions.strategyId, strategyId),
        gt(strategyExecutions.createdAt, windowStart),
      ),
    );

  const sumSpent = spendRows[0]?.sumSpent ?? 0;
  if (wouldBreachCap(sumSpent, cap, costUsdc)) {
    throw new OrderRejected("cap_breach", { strategyId, sumSpent, cap, costUsdc });
  }
}
