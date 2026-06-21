import { and, inArray, isNotNull } from "drizzle-orm";
import type { OpenOrder } from "@polymarket/client";
import { db } from "../db/client";
import { orderLog, strategyExecutions } from "../db/schema";
import { getSecureClient } from "../polymarket/client";
import { withTimeout, SDK_READ_TIMEOUT_MS } from "../safety/timeout";
import { logger } from "../logger";
import type { WorkerDef } from "./runner";

type LocalStatus = "placed" | "filled" | "cancelled" | "expired" | "unknown";

/**
 * Map SDK status string → our local status. Unrecognized values map to
 * "unknown" rather than the catch-all "placed" — a poisoned status would
 * otherwise spin forever, masking a real SDK change behind a benign label.
 */
function mapStatus(sdkStatus: string): LocalStatus {
  const s = sdkStatus.toLowerCase();
  if (s === "filled" || s === "matched") return "filled";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "expired") return "expired";
  if (s === "live" || s === "open" || s === "delayed" || s === "unmatched") return "placed";
  return "unknown";
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
      order = await withTimeout(client.fetchOrder({ orderId }), SDK_READ_TIMEOUT_MS, `fetchOrder(${orderId})`);
    } catch (err) {
      logger.warn({ orderId, err }, "orderReconcile: fetchOrder failed or timed out, skipping row");
      continue;
    }

    const newStatus = mapStatus(order.status);
    if (newStatus === "unknown") {
      logger.error(
        { orderId, sdkStatus: order.status, currentStatus: row.status },
        "orderReconcile: SDK returned status we don't recognize — leaving row untouched, add mapping",
      );
      continue;
    }
    if (newStatus === row.status) continue; // no change

    await db
      .update(orderLog)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(inArray(orderLog.id, [row.id])));

    logger.info({ orderId, prev: row.status, next: newStatus }, "orderReconcile: status updated");

    if (newStatus === "filled" && row.strategyId != null) {
      // Record the actually-matched size from the SDK, not the originally-
      // submitted row.size. For a partial that finally fills, the two can
      // differ; using row.size double-counts the unmatched remainder
      // against the cap window.
      const matchedSize = parseFloat(order.sizeMatched);
      const executionSize = Number.isFinite(matchedSize) && matchedSize > 0 ? matchedSize : row.size;
      await db.insert(strategyExecutions).values({
        strategyId: row.strategyId,
        marketId: null,
        tokenId: row.tokenId,
        side: row.side,
        price: row.price ?? parseFloat(order.price),
        size: executionSize,
        orderId,
        pnl: 0,
        note: "reconciled fill",
        createdAt: new Date(),
      });
      logger.info(
        { orderId, strategyId: row.strategyId, executionSize, originalSize: row.size },
        "orderReconcile: strategy execution recorded",
      );
    }
  }
}

export const orderReconcileWorker: WorkerDef = {
  name: "orderReconcile",
  intervalMs: 15_000,
  run,
};
