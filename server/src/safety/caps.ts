import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { SubmitOrderInput } from "@fifa/shared";
import { db } from "../db/client";
import { strategyConfigs, strategyExecutions, orderLog } from "../db/schema";

const CAP_WINDOW_MS = 24 * 60 * 60 * 1_000;
const INFLIGHT_STATUSES = ["submitted", "placed", "pending"] as const;

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

// MARKET BUY: SDK takes `amount: input.size` (USDC); input.size IS the cost.
// LIMIT (either side): cost = shares × price.
// MARKET SELL: no price → cost = 0; a sell recoups capital, not deploys it.
export function computeOrderCostUsdc(input: SubmitOrderInput): number {
  if (input.side === "BUY" && input.type === "MARKET") return input.size;
  return input.size * (input.price ?? 0);
}

export async function assertWithinCap(strategyId: number, costUsdc: number): Promise<void> {
  const cfgRows = await db
    .select({ capitalCap: strategyConfigs.capitalCap })
    .from(strategyConfigs)
    .where(eq(strategyConfigs.id, strategyId))
    .limit(1);

  const cap = cfgRows[0]?.capitalCap ?? 0;
  const windowStart = new Date(Date.now() - CAP_WINDOW_MS);

  // Filled spend: rolling 24h window on definitive fills.
  // In-flight commitment: every unfilled order is live capital regardless
  // of age, so no window — orders that are still resting against a 25h-old
  // limit ladder still tie up cap.
  const [spendRows, inflightRows] = await Promise.all([
    db
      .select({ sumSpent: sql<number>`coalesce(sum(size * price), 0)` })
      .from(strategyExecutions)
      .where(
        and(
          eq(strategyExecutions.strategyId, strategyId),
          gt(strategyExecutions.createdAt, windowStart),
        ),
      ),
    db
      .select({
        sumInflight: sql<number>`coalesce(sum(
          case
            when side = 'BUY' and type = 'MARKET' then size
            when type = 'LIMIT' then size * coalesce(price, 0)
            else 0
          end
        ), 0)`,
      })
      .from(orderLog)
      .where(
        and(
          eq(orderLog.strategyId, strategyId),
          inArray(orderLog.status, [...INFLIGHT_STATUSES]),
        ),
      ),
  ]);

  const filledSpent = Number(spendRows[0]?.sumSpent ?? 0);
  const inflightSpent = Number(inflightRows[0]?.sumInflight ?? 0);
  const sumSpent = filledSpent + inflightSpent;
  if (wouldBreachCap(sumSpent, cap, costUsdc)) {
    throw new OrderRejected("cap_breach", {
      strategyId,
      sumSpent,
      filledSpent,
      inflightSpent,
      cap,
      costUsdc,
    });
  }
}
