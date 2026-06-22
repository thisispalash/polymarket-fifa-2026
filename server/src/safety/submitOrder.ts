import { eq } from "drizzle-orm";
import type { SubmitOrderInput } from "@fifa/shared";
import { OrderSide } from "@polymarket/client";
import { db } from "../db/client";
import { orderLog } from "../db/schema";
import { getSecureClient } from "../polymarket/client";
import { logger } from "../logger";
import { isKillSwitchEnabled } from "./killSwitch";
import { assertWithinCap, computeOrderCostUsdc, OrderRejected } from "./caps";

export { OrderRejected };

interface SubmitOpts { strategyId?: number }

// Postgres returns 40001 (serialization_failure) when SSI detects two
// concurrent SERIALIZABLE txns whose effects would otherwise leak past
// each other. We retry once — under realistic v1 contention (a couple
// of worker ticks racing) the second attempt sees the prior commit and
// either passes cleanly or rejects via assertWithinCap.
function isSerializationFailure(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "40001"
  );
}

async function reserveOrderRow(
  input: SubmitOrderInput,
  opts: SubmitOpts,
): Promise<number> {
  return await db.transaction(async (tx) => {
    if (opts.strategyId !== undefined) {
      await assertWithinCap(opts.strategyId, computeOrderCostUsdc(input), tx);
    }
    const [row] = await tx
      .insert(orderLog)
      .values({
        tokenId: input.tokenId, side: input.side, type: input.type,
        price: input.price, size: input.size, strategyId: opts.strategyId,
        clientOrderId: input.clientOrderId,
        status: "submitted", requestPayload: input as Record<string, unknown>,
      })
      .returning({ id: orderLog.id });
    if (!row) throw new Error("Failed to insert order_log row");
    return row.id;
  }, { isolationLevel: "serializable" });
}

// Unique-violation on the partial index covering client_order_id. Caught
// in submitOrder to convert the race into the same idempotent return path
// as a primary lookup hit.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

interface IdempotentHit {
  orderId: string;
  status: string;
}

// Map an existing order_log row to the same `{orderId, status}` shape
// submitOrder returns on a successful path. We deliberately surface
// errored or rejected prior calls instead of "replaying" them — the
// retry can decide whether to resubmit with a new key.
async function findIdempotentHit(clientOrderId: string): Promise<IdempotentHit | null> {
  const [row] = await db
    .select({ orderId: orderLog.orderId, status: orderLog.status, errorMessage: orderLog.errorMessage })
    .from(orderLog)
    .where(eq(orderLog.clientOrderId, clientOrderId))
    .limit(1);
  if (!row) return null;
  if (row.status === "error" || row.status === "cancelled") {
    throw new OrderRejected("exchange_reject", {
      clientOrderId,
      replayedFrom: row.status,
      message: row.errorMessage ?? "prior attempt with this idempotency key failed",
    });
  }
  if (!row.orderId) {
    // The prior call has reserved a row but hasn't reached the SDK yet.
    // Treat this as still-in-flight — telling the client "duplicate" lets
    // them poll for the eventual state instead of placing a second order.
    return { orderId: "", status: row.status };
  }
  return { orderId: row.orderId, status: row.status };
}

export async function submitOrder(
  input: SubmitOrderInput,
  opts: SubmitOpts,
): Promise<{ orderId: string; status: string; idempotentReplay?: boolean }> {
  if (await isKillSwitchEnabled()) throw new OrderRejected("kill_switch");

  // Idempotency primary lookup: if the same client key arrived already,
  // surface the prior result without touching the SDK or the cap. This is
  // the common path — the unique-index catch below covers the narrow race
  // where two duplicate requests reach reserveOrderRow at the same time.
  if (input.clientOrderId) {
    const hit = await findIdempotentHit(input.clientOrderId);
    if (hit) {
      logger.info({ clientOrderId: input.clientOrderId, orderId: hit.orderId }, "submitOrder: idempotent replay");
      return { ...hit, idempotentReplay: true };
    }
  }

  let logId: number;
  try {
    logId = await reserveOrderRow(input, opts);
  } catch (err) {
    if (isSerializationFailure(err)) {
      logger.warn({ strategyId: opts.strategyId }, "submitOrder: serialization conflict, retrying once");
      logId = await reserveOrderRow(input, opts);
    } else if (isUniqueViolation(err) && input.clientOrderId) {
      logger.warn({ clientOrderId: input.clientOrderId }, "submitOrder: idempotency race, returning prior row");
      const hit = await findIdempotentHit(input.clientOrderId);
      if (hit) return { ...hit, idempotentReplay: true };
      throw err;
    } else {
      throw err;
    }
  }

  const client = await getSecureClient();
  const sdkSide = input.side === "BUY" ? OrderSide.BUY : OrderSide.SELL;

  let response: Awaited<ReturnType<typeof client.placeLimitOrder>>;
  try {
    if (input.type === "LIMIT") {
      if (input.price === undefined) throw new Error("LIMIT order requires a price");
      response = await client.placeLimitOrder({ tokenId: input.tokenId, side: sdkSide, price: input.price, size: input.size });
    } else {
      response = await client.placeMarketOrder(
        sdkSide === OrderSide.BUY
          ? { tokenId: input.tokenId, side: OrderSide.BUY, amount: input.size }
          : { tokenId: input.tokenId, side: OrderSide.SELL, shares: input.size },
      );
    }
  } catch (err) {
    await db.update(orderLog)
      .set({ status: "error", errorMessage: err instanceof Error ? err.message : String(err), updatedAt: new Date() })
      .where(eq(orderLog.id, logId));
    throw err;
  }

  if (response.ok) {
    await db.update(orderLog)
      .set({ status: "placed", orderId: response.orderId, responsePayload: response as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(orderLog.id, logId));
    logger.info({ logId, orderId: response.orderId }, "order placed");

    // Kill switch could have been tripped during the SDK call (200ms-2s).
    // If so, cancel the just-placed order so it doesn't sit on the book
    // after the operator hit the kill switch.
    if (await isKillSwitchEnabled()) {
      try {
        await client.cancelOrder({ orderId: response.orderId });
        logger.warn({ logId, orderId: response.orderId }, "kill switch tripped during SDK call — cancelled just-placed order");
      } catch (cancelErr) {
        logger.error({ logId, orderId: response.orderId, err: cancelErr }, "kill switch tripped during SDK call — FAILED to cancel just-placed order");
      }
      await db.update(orderLog)
        .set({ status: "cancelled", errorMessage: "kill_switch tripped during SDK call", updatedAt: new Date() })
        .where(eq(orderLog.id, logId));
      throw new OrderRejected("kill_switch", { orderId: response.orderId, racedDuringSdk: true });
    }

    return { orderId: response.orderId, status: response.status };
  }

  const errMsg = `Order rejected by exchange: ${response.code} — ${response.message}`;
  await db.update(orderLog)
    .set({ status: "error", errorMessage: errMsg, responsePayload: response as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(orderLog.id, logId));
  // Throw OrderRejected (not bare Error) so the HTTP layer renders a 409
  // with the exchange's code/message instead of a 500 "Internal Server
  // Error" toast on routine bad-price rejects.
  throw new OrderRejected("exchange_reject", {
    code: response.code,
    message: response.message,
  });
}
