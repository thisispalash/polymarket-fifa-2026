import { and, inArray, isNotNull } from "drizzle-orm";
import type { OpenOrder } from "@polymarket/client";
import { db } from "../db/client";
import { orderLog, strategyExecutions } from "../db/schema";
import { getSecureClient } from "../polymarket/client";
import { withTimeout, SDK_READ_TIMEOUT_MS } from "../safety/timeout";
import { mapWithConcurrency } from "../safety/concurrency";
import { logger } from "../logger";
import type { WorkerDef } from "./runner";

// Bound SDK fan-out so a backlog of pending orders doesn't fan out to 100
// concurrent fetchOrder calls and trip Polymarket's rate limits.
const RECONCILE_CONCURRENCY = 6;

type LocalStatus = "placed" | "filled" | "cancelled" | "expired" | "unknown";
type OrderLogRow = typeof orderLog.$inferSelect;

// Normalize an SDK fill into (shares, execPrice) so the SUM(size*price)
// formula in caps.ts always yields USDC notional regardless of order
// type. Two pitfalls this guards against:
//   1. MARKET BUY stores row.size as USDC (the SDK takes `amount`, not
//      `shares`). Multiplying that by fill price halves the notional.
//   2. row.price is null for MARKET orders. Falling back to the exec
//      price keeps the formula meaningful.
function normalizedExecution(
  row: OrderLogRow,
  order: OpenOrder,
): { shares: number; execPrice: number } {
  const parsedExecPrice = parseFloat(order.price);
  const execPrice = Number.isFinite(parsedExecPrice) && parsedExecPrice > 0
    ? parsedExecPrice
    : row.price ?? 0;

  const sdkShares = parseFloat(order.sizeMatched);
  if (Number.isFinite(sdkShares) && sdkShares > 0) {
    return { shares: sdkShares, execPrice };
  }

  // Fallback when sizeMatched is unparseable. MARKET BUY's row.size is
  // USDC, so divide by exec price to recover shares; everything else
  // already stores row.size as shares.
  if (row.side === "BUY" && row.type === "MARKET" && execPrice > 0) {
    return { shares: row.size / execPrice, execPrice };
  }
  return { shares: row.size, execPrice };
}

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

  // Phase 1 — fan SDK fetches out concurrently. Failures are surfaced per
  // row so a single hang doesn't stall the rest of the batch.
  const fetched = await mapWithConcurrency(pending, RECONCILE_CONCURRENCY, async (row) => {
    const orderId = row.orderId!;
    return withTimeout(client.fetchOrder({ orderId }), SDK_READ_TIMEOUT_MS, `fetchOrder(${orderId})`);
  });

  // Phase 2 — apply DB updates sequentially. The writes are independent
  // across rows, but keeping them serial caps the connection-pool fan-out
  // and keeps the worker easy to reason about under load.
  for (let i = 0; i < pending.length; i++) {
    const row = pending[i]!;
    const orderId = row.orderId;
    if (!orderId) continue;

    const fetchResult = fetched[i]!;
    if (fetchResult.status === "rejected") {
      logger.warn({ orderId, err: fetchResult.reason }, "orderReconcile: fetchOrder failed or timed out, skipping row");
      continue;
    }
    const order: OpenOrder = fetchResult.value;

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

    // Terminal-state recorders. Each transition fires at most once because
    // `newStatus === row.status` continues earlier and these are leaf states.
    //   filled    → always record (shares matched > 0 by definition)
    //   cancelled → record IF the order had a partial fill before being
    //               yanked. Without this branch the matched portion never
    //               counts against the strategy cap, leaving phantom room.
    const partialOnCancel =
      newStatus === "cancelled" &&
      Number.isFinite(parseFloat(order.sizeMatched)) &&
      parseFloat(order.sizeMatched) > 0;

    if ((newStatus === "filled" || partialOnCancel) && row.strategyId != null) {
      const { shares, execPrice } = normalizedExecution(row, order);
      await db.insert(strategyExecutions).values({
        strategyId: row.strategyId,
        marketId: null,
        tokenId: row.tokenId,
        side: row.side,
        price: execPrice,
        size: shares,
        orderId,
        pnl: 0,
        note: partialOnCancel ? "partial fill on cancel" : "reconciled fill",
        createdAt: new Date(),
      });
      logger.info(
        {
          orderId,
          strategyId: row.strategyId,
          shares,
          execPrice,
          notionalUsdc: shares * execPrice,
          originalSize: row.size,
          partialOnCancel,
        },
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
