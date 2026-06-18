import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { watchlist, strategyConfigs, arbOpportunities } from "../db/schema";
import { getMarketDetail } from "../polymarket/markets";
import { detect, computeStakes } from "../strategies/dutchArb";
import { submitOrder, OrderRejected } from "../safety/submitOrder";
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
      if (asks.some((p) => isNaN(p))) continue;
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
        price: asks[i] ?? 0,
        shares: (stakes[i] ?? 0) / (asks[i] ?? 1),
        cost: stakes[i] ?? 0,
      }));

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
      logger.info({ marketId: row.marketId, sumPrice: opp.sumPrice, edgePct: opp.edgePct }, "arb opp detected");

      if (config?.enabled === true && config.autoExecute === true) {
        const strategyId = config.id;
        for (let i = 0; i < outcomes.length; i++) {
          const outcome = outcomes[i];
          const price = asks[i];
          const stake = stakes[i];
          if (outcome === undefined || price === undefined || stake === undefined) continue;
          try {
            await submitOrder({ tokenId: outcome.tokenId, side: "BUY", type: "LIMIT", size: stake / price, price }, { strategyId });
          } catch (err) {
            if (err instanceof OrderRejected) {
              logger.warn({ marketId: row.marketId, err: err.message }, "arb order rejected");
            } else {
              throw err;
            }
          }
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
