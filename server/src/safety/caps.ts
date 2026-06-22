import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { SubmitOrderInput } from "@fifa/shared";
import { db } from "../db/client";
import { strategyConfigs, strategyExecutions, orderLog } from "../db/schema";

// Either the global db or an in-progress transaction. The cap query needs
// to run against the same snapshot as the orderLog insert to close the
// TOCTOU race; the caller wraps both in a SERIALIZABLE tx and passes it.
// drizzle's PgTransaction has higher-kinded type params we don't need to
// surface here — `any` keeps the union open to any valid tx instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbOrTx = typeof db | PgTransaction<any, any, any>;

const CAP_WINDOW_MS = 24 * 60 * 60 * 1_000;
const INFLIGHT_STATUSES = ["submitted", "placed", "pending"] as const;

export type OrderRejectReason = "cap_breach" | "kill_switch" | "exchange_reject";

export class OrderRejected extends Error {
  readonly reason: OrderRejectReason;
  readonly meta: Record<string, unknown>;
  constructor(reason: OrderRejectReason, meta: Record<string, unknown> = {}) {
    const detail = Object.keys(meta).length === 0
      ? ""
      : ` (${Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(", ")})`;
    super(`Order rejected: ${reason}${detail}`);
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

export async function assertWithinCap(
  strategyId: number,
  costUsdc: number,
  handle: DbOrTx = db,
): Promise<void> {
  const cfgRows = await handle
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
    handle
      .select({ sumSpent: sql<number>`coalesce(sum(size * price), 0)` })
      .from(strategyExecutions)
      .where(
        and(
          eq(strategyExecutions.strategyId, strategyId),
          gt(strategyExecutions.createdAt, windowStart),
        ),
      ),
    handle
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
