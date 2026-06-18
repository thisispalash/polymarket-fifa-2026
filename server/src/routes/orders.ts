import { FastifyInstance } from "fastify";
import { z } from "zod";
import { submitOrder, OrderRejected } from "../safety/submitOrder";
import { getSecureClient } from "../polymarket/client";
import { logger } from "../logger";

const orderBodySchema = z.object({
  tokenId: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  type: z.enum(["MARKET", "LIMIT"]),
  size: z.number().positive(),
  price: z.number().positive().optional(),
  strategyId: z.number().int().positive().optional(),
});

const cancelParamsSchema = z.object({
  orderId: z.string().min(1),
});

export async function ordersRoutes(app: FastifyInstance): Promise<void> {
  app.post("/orders", async (request, reply) => {
    const body = orderBodySchema.safeParse(request.body);
    if (!body.success) return reply.send(app.httpErrors.badRequest(body.error.message));

    const { strategyId, ...input } = body.data;

    try {
      const result = await submitOrder(input, { strategyId });
      logger.info({ orderId: result.orderId }, "order submitted via route");
      return result;
    } catch (err) {
      if (err instanceof OrderRejected) {
        return reply.status(409).send({ error: err.reason });
      }
      throw err;
    }
  });

  app.delete<{ Params: { orderId: string } }>("/orders/:orderId", async (request, reply) => {
    const params = cancelParamsSchema.safeParse(request.params);
    if (!params.success) return reply.send(app.httpErrors.badRequest(params.error.message));

    const { orderId } = params.data;
    const client = await getSecureClient();
    const result = await client.cancelOrder({ orderId });
    logger.info({ orderId }, "order cancelled via route");
    return result;
  });
}
