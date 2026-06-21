import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { watchlist, strategyConfigs, arbOpportunities } from "../db/schema";
import { getMarketDetail } from "../polymarket/markets";
import { detect, computeStakes } from "../strategies/dutchArb";
import { submitOrder, OrderRejected } from "../safety/submitOrder";
import { cancelLegsBestEffort } from "../safety/unwind";
import { logger } from "../logger";
import type { WorkerDef } from "./runner";

async function tick(): Promise<void> {
  const rows = await db.select().from(watchlist);
  for (const row of rows) {
    try {
      const { market, outcomes } = await getMarketDetail(row.marketId);
      if (outcomes.length < 2) continue;
      const bestAsks = outcomes.map((o) => o.book.asks[0]?.price);
      if (bestAsks.some((p) => p == null)) continue;
      const asks = bestAsks.map((p) => typeof p === "string" ? parseFloat(p) : Number(p));
      // `??` would let through 0/NaN; reject every non-positive ask so the
      // stake-per-share division below can't produce Infinity.
      if (asks.some((p) => !(p > 0))) continue;
      const opp = detect(asks, 0.01);
      if (opp === null) continue;

      const [config] = await db
        .select().from(strategyConfigs)
        .where(eq(strategyConfigs.kind, "dutch_arb")).limit(1);
      const cap = config && config.capitalCap > 0 ? config.capitalCap : 50;
      const stakeResult = computeStakes(asks, cap);
      if (stakeResult === null) continue;
      const { stakes, profit } = stakeResult;

      const conditionId: string = market.conditionId ?? row.conditionId;
      const question: string = market.question ?? row.question ?? "Unknown";
      const stakesPayload = outcomes.map((o, i) => ({
        tokenId: o.tokenId,
        price: asks[i]!,
        shares: (stakes[i] ?? 0) / asks[i]!,
        cost: stakes[i] ?? 0,
      }));

      // At most one open opportunity per market: refresh in place when the
      // book moves, only create a new row when the prior one has been
      // executed (or never existed). Otherwise the table grows ~6 rows/min
      // per market with edge.
      const [existing] = await db
        .select({ id: arbOpportunities.id })
        .from(arbOpportunities)
        .where(and(eq(arbOpportunities.marketId, row.marketId), eq(arbOpportunities.executed, false)))
        .limit(1);

      if (existing) {
        // Re-check `executed = false` so a user clicking Execute between
        // the SELECT and this UPDATE doesn't get the historical snapshot
        // overwritten with the latest book.
        await db.update(arbOpportunities)
          .set({
            kind: "dutch_arb",
            conditionId,
            question,
            sumPrice: opp.sumPrice,
            edgePct: opp.edgePct,
            stakes: stakesPayload as unknown as Record<string, unknown>[],
            estimatedProfit: profit,
            detectedAt: new Date(),
          })
          .where(and(eq(arbOpportunities.id, existing.id), eq(arbOpportunities.executed, false)));
      } else {
        await db.insert(arbOpportunities).values({
          kind: "dutch_arb",
          marketId: row.marketId,
          conditionId,
          question,
          sumPrice: opp.sumPrice,
          edgePct: opp.edgePct,
          stakes: stakesPayload as unknown as Record<string, unknown>[],
          estimatedProfit: profit,
          executed: false,
        });
      }
      logger.info({ marketId: row.marketId, sumPrice: opp.sumPrice, edgePct: opp.edgePct, refreshed: !!existing }, "arb opp detected");

      if (config?.enabled === true && config.autoExecute === true) {
        const strategyId = config.id;
        const placedOrderIds: string[] = [];
        let legError: unknown = null;
        let failedLegIdx: number | null = null;
        for (let i = 0; i < outcomes.length; i++) {
          const outcome = outcomes[i];
          const price = asks[i];
          const stake = stakes[i];
          if (outcome === undefined || price === undefined || stake === undefined) continue;
          try {
            const res = await submitOrder(
              { tokenId: outcome.tokenId, side: "BUY", type: "LIMIT", size: stake / price, price },
              { strategyId },
            );
            placedOrderIds.push(res.orderId);
          } catch (err) {
            legError = err;
            failedLegIdx = i;
            break;
          }
        }
        if (legError !== null) {
          const msg = legError instanceof OrderRejected ? legError.message : String(legError);
          logger.warn(
            { marketId: row.marketId, legIdx: failedLegIdx, placedCount: placedOrderIds.length, err: msg },
            "arbScan: auto-exec leg failed, unwinding prior legs",
          );
          await cancelLegsBestEffort(placedOrderIds, {
            source: "arbScan.auto-exec",
            marketId: row.marketId,
          });
        }
      }
    } catch (err) {
      logger.error({ marketId: row.marketId, err }, "arbScan: per-market error");
    }
  }
}

export const arbScanWorker: WorkerDef = {
  name: "arbScan",
  intervalMs: 10_000,
  run: tick,
};
