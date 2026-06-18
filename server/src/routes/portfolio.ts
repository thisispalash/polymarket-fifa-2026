import { FastifyInstance } from "fastify";
import { desc } from "drizzle-orm";
import { db } from "../db/client";
import { positionsCache, balancesCache } from "../db/schema";

export async function portfolioRoutes(app: FastifyInstance): Promise<void> {
  app.get("/portfolio", async () => {
    const [positions, balanceRows] = await Promise.all([
      db.select().from(positionsCache).orderBy(positionsCache.updatedAt),
      db.select().from(balancesCache).orderBy(desc(balancesCache.updatedAt)).limit(1),
    ]);

    const computed = positions.map((p) => {
      const costBasis = p.shares * p.avgPrice;
      const currentValue = p.shares * p.currentPrice;
      const unrealizedPnl = currentValue - costBasis;
      const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
      return { ...p, costBasis, currentValue, unrealizedPnl, unrealizedPnlPct };
    });

    const totalCostBasis = computed.reduce((sum, p) => sum + p.costBasis, 0);
    const totalCurrentValue = computed.reduce((sum, p) => sum + p.currentValue, 0);
    const totalUnrealizedPnl = totalCurrentValue - totalCostBasis;

    const latestBalance = balanceRows[0];
    const usdc = latestBalance?.usdc ?? 0;

    const asOf = computed.length > 0
      ? computed.reduce((latest, p) =>
          p.updatedAt > latest ? p.updatedAt : latest,
          computed[0]!.updatedAt
        )
      : null;

    return {
      positions: computed,
      balances: { usdc, totalCostBasis, totalCurrentValue, totalUnrealizedPnl },
      asOf,
    };
  });
}
