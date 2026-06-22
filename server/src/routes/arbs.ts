import { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { arbOpportunities, strategyConfigs } from "../db/schema";
import { getMarketDetail } from "../polymarket/markets";
import { computeStakes } from "../strategies/dutchArb";
import { submitOrder, OrderRejected } from "../safety/submitOrder";
import { cancelLegsBestEffort } from "../safety/unwind";
import { logger } from "../logger";

const executeParamsSchema = z.object({ oppId: z.coerce.number().int().positive() });

interface StakeLeg {
  tokenId: string;
  price: number;
  shares: number;
  cost: number;
}

export async function arbsRoutes(app: FastifyInstance): Promise<void> {
  // GET /arb/opportunities — newest 50 rows
  app.get("/arb/opportunities", async (_request, reply) => {
    try {
      const rows = await db
        .select()
        .from(arbOpportunities)
        .orderBy(desc(arbOpportunities.detectedAt))
        .limit(50);
      return rows;
    } catch (err) {
      logger.error({ err }, "arb/opportunities: db error");
      return reply.send(app.httpErrors.internalServerError("Failed to fetch arb opportunities"));
    }
  });

  // POST /arb/execute/:oppId — validate + re-check drift + fire legs
  app.post<{ Params: { oppId: string } }>("/arb/execute/:oppId", async (request, reply) => {
    const params = executeParamsSchema.safeParse(request.params);
    if (!params.success) return reply.send(app.httpErrors.badRequest(params.error.message));

    const { oppId } = params.data;

    // 1. Load opportunity row
    const [opp] = await db
      .select()
      .from(arbOpportunities)
      .where(eq(arbOpportunities.id, oppId))
      .limit(1);
    if (!opp) return reply.status(404).send({ error: "Opportunity not found" });
    if (opp.executed) return reply.status(409).send({ error: "already executed" });

    // 1b. Resolve the strategy id for this arb kind so submitOrder enforces
    //     the per-strategy capital cap on the manual execute path. Without
    //     this, the user could click Execute on a $400 arb under a $50 cap
    //     and submitOrder would let it through.
    const [strategy] = await db
      .select({ id: strategyConfigs.id })
      .from(strategyConfigs)
      .where(eq(strategyConfigs.kind, opp.kind))
      .limit(1);
    if (!strategy) {
      return reply
        .status(500)
        .send({ error: `No ${opp.kind} strategy config — has it been seeded via GET /strategies?` });
    }
    const strategyId = strategy.id;

    // 2. Re-fetch fresh orderbook
    let outcomes: Awaited<ReturnType<typeof getMarketDetail>>["outcomes"];
    try {
      const detail = await getMarketDetail(opp.marketId);
      outcomes = detail.outcomes;
    } catch (err) {
      logger.error({ err, marketId: opp.marketId }, "arb/execute: market fetch error");
      return reply.send(app.httpErrors.internalServerError("Failed to fetch market detail"));
    }

    const freshAsks = outcomes.map((o) => {
      const raw = o.book.asks[0]?.price;
      return typeof raw === "string" ? parseFloat(raw) : Number(raw ?? NaN);
    });
    if (freshAsks.some((p) => isNaN(p))) {
      return reply.status(409).send({ error: "orderbook missing asks" });
    }

    const currentSum = freshAsks.reduce((a, b) => a + b, 0);

    // 3. Drift guard
    if (currentSum > opp.sumPrice + 0.01) {
      return reply.status(409).send({ error: "price drifted" });
    }

    // 4. Recompute stakes
    const storedLegs = opp.stakes as unknown as StakeLeg[];
    const budget = storedLegs.reduce((s, l) => s + l.cost, 0) || 50;
    const recomputed = computeStakes(freshAsks, budget);
    if (!recomputed) return reply.status(409).send({ error: "no edge" });

    // 5. Fire each leg. On any failure, unwind the legs already placed so
    //    the user is never left holding a one-sided position.
    const results: Array<{ tokenId: string; orderId?: string; error?: string }> = [];
    const placedOrderIds: string[] = [];
    for (let i = 0; i < outcomes.length; i++) {
      const outcome = outcomes[i]!;
      const price = freshAsks[i]!;
      const stake = recomputed.stakes[i]!;
      try {
        const res = await submitOrder(
          { tokenId: outcome.tokenId, side: "BUY", type: "LIMIT", size: stake / price, price },
          { strategyId },
        );
        placedOrderIds.push(res.orderId);
        results.push({ tokenId: outcome.tokenId, orderId: res.orderId });
      } catch (err) {
        const msg = err instanceof OrderRejected ? err.message : String(err);
        logger.warn(
          { tokenId: outcome.tokenId, legIdx: i, placedCount: placedOrderIds.length, err: msg },
          "arb/execute: leg rejected, unwinding prior legs",
        );
        const { cancelled, failedIds } = await cancelLegsBestEffort(placedOrderIds, {
          source: "arb/execute",
          marketId: opp.marketId,
        });
        return reply.status(409).send({
          error: msg,
          unwound: cancelled,
          unwindFailures: failedIds.length > 0 ? failedIds : undefined,
        });
      }
    }

    // 6. Mark executed. A DB transient here leaves the row at executed=false
    //    even though the legs are live, which lets the user double-execute on
    //    a second click. Log loud and warn the caller — the row will be
    //    backfilled the next time the row is touched, but the user should not
    //    retry.
    try {
      await db
        .update(arbOpportunities)
        .set({ executed: true, executedAt: new Date() })
        .where(eq(arbOpportunities.id, oppId));
    } catch (err) {
      logger.error(
        { oppId, err, placedOrderIds, legs: results.length },
        "arb/execute: legs placed but failed to mark opportunity executed — do not retry",
      );
      return reply.status(200).send({
        executed: true,
        results,
        warning: "legs placed but executed flag not persisted — do not retry",
      });
    }

    logger.info({ oppId, legs: results.length }, "arb executed");
    return { executed: true, results };
  });
}
