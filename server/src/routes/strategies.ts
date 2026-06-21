import { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { strategyConfigs, strategyExecutions } from "../db/schema";
import { STRATEGY_KINDS } from "@fifa/shared";
import { logger } from "../logger";

const toggleBodySchema = z.object({ enabled: z.boolean() });
const allocateBodySchema = z.object({ capitalCap: z.number().min(0) });
const autoExecuteBodySchema = z.object({ autoExecute: z.boolean() });
const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

async function seedIfEmpty(): Promise<void> {
  const rows = await db.select({ id: strategyConfigs.id }).from(strategyConfigs).limit(1);
  if (rows.length > 0) return;

  await db.insert(strategyConfigs).values(
    STRATEGY_KINDS.map((kind) => ({ kind, enabled: false, capitalCap: 0, params: {} }))
  );
  logger.info("seeded strategy_configs");
}

export async function strategiesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/strategies", async () => {
    await seedIfEmpty();

    const [configs, pnlRows] = await Promise.all([
      db.select().from(strategyConfigs).orderBy(strategyConfigs.id),
      db
        .select({ strategyId: strategyExecutions.strategyId, pnl: sql<string>`sum(${strategyExecutions.pnl})` })
        .from(strategyExecutions)
        .groupBy(strategyExecutions.strategyId),
    ]);

    const pnlByStrategy = new Map(pnlRows.map((r) => [r.strategyId, parseFloat(r.pnl ?? "0")]));

    return configs.map((c) => ({
      ...c,
      realizedPnl: pnlByStrategy.get(c.id) ?? 0,
    }));
  });

  app.post<{ Params: { id: string } }>("/strategies/:id/toggle", async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.send(app.httpErrors.badRequest(params.error.message));
    const body = toggleBodySchema.safeParse(request.body);
    if (!body.success) return reply.send(app.httpErrors.badRequest(body.error.message));

    const [updated] = await db
      .update(strategyConfigs)
      .set({ enabled: body.data.enabled, updatedAt: new Date() })
      .where(eq(strategyConfigs.id, params.data.id))
      .returning();

    if (!updated) return reply.send(app.httpErrors.notFound("Strategy not found"));
    logger.info({ id: params.data.id, enabled: body.data.enabled }, "strategy toggled");
    return updated;
  });

  app.post<{ Params: { id: string } }>("/strategies/:id/allocate", async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.send(app.httpErrors.badRequest(params.error.message));
    const body = allocateBodySchema.safeParse(request.body);
    if (!body.success) return reply.send(app.httpErrors.badRequest(body.error.message));

    const [updated] = await db
      .update(strategyConfigs)
      .set({ capitalCap: body.data.capitalCap, updatedAt: new Date() })
      .where(eq(strategyConfigs.id, params.data.id))
      .returning();

    if (!updated) return reply.send(app.httpErrors.notFound("Strategy not found"));
    logger.info({ id: params.data.id, capitalCap: body.data.capitalCap }, "strategy allocated");
    return updated;
  });

  app.post<{ Params: { id: string } }>("/strategies/:id/auto-execute", async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.send(app.httpErrors.badRequest(params.error.message));
    const body = autoExecuteBodySchema.safeParse(request.body);
    if (!body.success) return reply.send(app.httpErrors.badRequest(body.error.message));

    const [updated] = await db
      .update(strategyConfigs)
      .set({ autoExecute: body.data.autoExecute, updatedAt: new Date() })
      .where(eq(strategyConfigs.id, params.data.id))
      .returning();

    if (!updated) return reply.send(app.httpErrors.notFound("Strategy not found"));
    logger.info({ id: params.data.id, autoExecute: body.data.autoExecute }, "strategy auto-execute set");
    return updated;
  });
}
