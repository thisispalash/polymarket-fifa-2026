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

export async function submitOrder(
  input: SubmitOrderInput,
  opts: SubmitOpts,
): Promise<{ orderId: string; status: string }> {
  if (await isKillSwitchEnabled()) throw new OrderRejected("kill_switch");
  if (opts.strategyId !== undefined)
    await assertWithinCap(opts.strategyId, computeOrderCostUsdc(input));

  const [row] = await db
    .insert(orderLog)
    .values({
      tokenId: input.tokenId, side: input.side, type: input.type,
      price: input.price, size: input.size, strategyId: opts.strategyId,
      status: "submitted", requestPayload: input as Record<string, unknown>,
    })
    .returning({ id: orderLog.id });

  const logId = row?.id;
  if (logId === undefined) throw new Error("Failed to insert order_log row");

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
  throw new Error(errMsg);
}
