import { and, inArray, isNotNull } from "drizzle-orm";
import type { OpenOrder } from "@polymarket/client";
import { db } from "../db/client";
import { orderLog, strategyExecutions } from "../db/schema";
import { getSecureClient } from "../polymarket/client";
import { logger } from "../logger";
import type { WorkerDef } from "./runner";

/** Map SDK status string → our local status. */
function mapStatus(sdkStatus: string): string {
  const s = sdkStatus.toLowerCase();
  if (s === "filled" || s === "matched") return "filled";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "expired") return "expired";
  // live / open / delayed / unmatched
  return "placed";
}

async function run(): Promise<void> {
  const pending = await db
    .select()
    .from(orderLog)
    .where(
      and(
        inArray(orderLog.status, ["submitted", "placed", "pending"]),
        isNotNull(orderLog.orderId),
      ),
    );

  if (pending.length === 0) return;

  const client = await getSecureClient();

  for (const row of pending) {
    const orderId = row.orderId;
    if (!orderId) continue; // already guarded above, keeps TS happy

    let order: OpenOrder;
    try {
      order = await client.fetchOrder({ orderId });
    } catch (err) {
      logger.warn({ orderId, err }, "orderReconcile: fetchOrder failed, skipping row");
      continue;
    }

    const newStatus = mapStatus(order.status);
    if (newStatus === row.status) continue; // no change

    await db
      .update(orderLog)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(inArray(orderLog.id, [row.id])));

    logger.info({ orderId, prev: row.status, next: newStatus }, "orderReconcile: status updated");

    if (newStatus === "filled" && row.strategyId != null) {
      await db.insert(strategyExecutions).values({
        strategyId: row.strategyId,
        marketId: null,
        tokenId: row.tokenId,
        side: row.side,
        price: row.price ?? parseFloat(order.price),
        size: row.size,
        orderId,
        pnl: 0,
        note: "reconciled fill",
        createdAt: new Date(),
      });
      logger.info({ orderId, strategyId: row.strategyId }, "orderReconcile: strategy execution recorded");
    }
  }
}

export const orderReconcileWorker: WorkerDef = {
  name: "orderReconcile",
  intervalMs: 15_000,
  run,
};
