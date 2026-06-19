import { getSecureClient } from "../polymarket/client";
import { logger } from "../logger";

// Best-effort unwind of multi-leg orders after a partial failure. Cancels
// every placed leg concurrently; per-leg cancel failures are reported back
// so the caller can surface naked-leg risk to the user instead of silently
// leaving a one-sided position open.
export async function cancelLegsBestEffort(
  orderIds: string[],
  context: { source: string; marketId?: string },
): Promise<{ cancelled: number; failedIds: string[] }> {
  if (orderIds.length === 0) return { cancelled: 0, failedIds: [] };

  let client: Awaited<ReturnType<typeof getSecureClient>>;
  try {
    client = await getSecureClient();
  } catch (err) {
    logger.error({ ...context, err, orderIds }, "unwind: failed to obtain SDK client — naked exposure remains");
    return { cancelled: 0, failedIds: [...orderIds] };
  }

  const results = await Promise.allSettled(
    orderIds.map((orderId) => client.cancelOrder({ orderId })),
  );

  const failedIds: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const orderId = orderIds[i]!;
      failedIds.push(orderId);
      logger.error({ ...context, orderId, err: r.reason }, "unwind: cancelOrder failed");
    }
  });

  const cancelled = orderIds.length - failedIds.length;
  if (failedIds.length === 0) {
    logger.info({ ...context, cancelled }, "unwind: all prior legs cancelled");
  } else {
    logger.error(
      { ...context, cancelled, failedIds },
      "unwind: some prior legs could not be cancelled — naked exposure remains",
    );
  }

  return { cancelled, failedIds };
}
