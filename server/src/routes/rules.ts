import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { strategyConfigs, strategyRules } from "../db/schema";
import { logger } from "../logger";

const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const ruleParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  rid: z.coerce.number().int().positive(),
});

// Rule shapes per strategy kind
const tpSlRuleSchema = z.object({
  tokenId: z.string().min(1),
  takeProfit: z.number().min(0).max(1).optional(),
  stopLoss: z.number().min(0).max(1).optional(),
  slippageBps: z.number().int().min(0).optional(),
});

const trailingStopRuleSchema = z.object({
  tokenId: z.string().min(1),
  trailPct: z.number().positive(),
  highWaterMark: z.number().optional(),
  triggerPrice: z.number().optional(),
});

const scaleOutRuleSchema = z.object({
  tokenId: z.string().min(1),
  legs: z.array(z.object({ pct: z.number().positive(), atPrice: z.number().positive(), consumed: z.boolean().default(false) })).min(1),
});

const limitLadderRuleSchema = z.object({
  marketId: z.string().min(1),
  tokenId: z.string().min(1),
  rungs: z.array(z.object({
    price: z.number().positive(), size: z.number().positive(),
    side: z.enum(["BUY", "SELL"]), orderId: z.string().optional(), filled: z.boolean().optional(),
  })).min(1),
  topUp: z.boolean(),
  maxActive: z.number().int().positive(),
});

const ruleSchemaByKind = {
  tp_sl: tpSlRuleSchema,
  trailing_stop: trailingStopRuleSchema,
  scale_out: scaleOutRuleSchema,
  limit_ladder: limitLadderRuleSchema,
  dutch_arb: z.object({}).passthrough(),
  yesno_arb: z.object({}).passthrough(),
} as const;

type KindKey = keyof typeof ruleSchemaByKind;

export async function rulesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/strategies/:id/rules", async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.send(app.httpErrors.badRequest(params.error.message));

    return db.select().from(strategyRules).where(eq(strategyRules.strategyId, params.data.id));
  });

  app.post<{ Params: { id: string } }>("/strategies/:id/rules", async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.send(app.httpErrors.badRequest(params.error.message));

    const strategy = await db.select({ kind: strategyConfigs.kind })
      .from(strategyConfigs).where(eq(strategyConfigs.id, params.data.id)).limit(1);
    if (strategy.length === 0) return reply.send(app.httpErrors.notFound("Strategy not found"));

    const kind = strategy[0]!.kind as KindKey;
    const schema = ruleSchemaByKind[kind] ?? z.object({}).passthrough();
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.send(app.httpErrors.badRequest(parsed.error.message));

    const [row] = await db.insert(strategyRules).values({
      strategyId: params.data.id,
      rule: parsed.data as Record<string, unknown>,
      status: "active",
    }).returning();

    logger.info({ strategyId: params.data.id, kind }, "rule created");
    return row;
  });

  app.delete<{ Params: { id: string; rid: string } }>("/strategies/:id/rules/:rid", async (request, reply) => {
    const params = ruleParamsSchema.safeParse(request.params);
    if (!params.success) return reply.send(app.httpErrors.badRequest(params.error.message));

    const deleted = await db.delete(strategyRules)
      .where(and(eq(strategyRules.id, params.data.rid), eq(strategyRules.strategyId, params.data.id)))
      .returning({ id: strategyRules.id });

    if (deleted.length === 0) return reply.send(app.httpErrors.notFound("Rule not found"));
    logger.info({ id: params.data.rid, strategyId: params.data.id }, "rule deleted");
    return { deleted: true };
  });
}
