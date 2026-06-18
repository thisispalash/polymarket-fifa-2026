import { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { watchlist } from "../db/schema";
import { logger } from "../logger";

const bodySchema = z.object({
  slug: z.string().min(1),
  question: z.string().min(1),
  conditionId: z.string().min(1),
});

const paramsSchema = z.object({
  marketId: z.string().min(1),
});

export async function watchlistRoutes(app: FastifyInstance): Promise<void> {
  app.get("/watchlist", async () => {
    return db.select().from(watchlist).orderBy(watchlist.addedAt);
  });

  app.post<{ Params: { marketId: string } }>("/watchlist/:marketId", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.send(app.httpErrors.badRequest(params.error.message));
    const body = bodySchema.safeParse(request.body);
    if (!body.success) return reply.send(app.httpErrors.badRequest(body.error.message));

    const { marketId } = params.data;
    const { slug, question, conditionId } = body.data;

    const [row] = await db
      .insert(watchlist)
      .values({ marketId, slug, question, conditionId })
      .onConflictDoUpdate({
        target: watchlist.marketId,
        set: { slug, question, conditionId },
      })
      .returning();

    logger.info({ marketId }, "watchlist upsert");
    return row;
  });

  app.delete<{ Params: { marketId: string } }>("/watchlist/:marketId", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.send(app.httpErrors.badRequest(params.error.message));

    const { marketId } = params.data;
    const deleted = await db
      .delete(watchlist)
      .where(eq(watchlist.marketId, marketId))
      .returning({ id: watchlist.id });

    if (deleted.length === 0) return reply.send(app.httpErrors.notFound("Market not in watchlist"));
    logger.info({ marketId }, "watchlist delete");
    return { deleted: true };
  });
}
