import { AssetType } from "@polymarket/client";
import { fetchBalanceAllowance } from "@polymarket/client/actions";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { positionsCache, balancesCache, priceHistory } from "../db/schema";
import { getSecureClient, getPublicClient } from "../polymarket/client";
import { logger } from "../logger";
import type { WorkerDef } from "./runner";

async function run(): Promise<void> {
  const client = await getSecureClient();
  const pub = getPublicClient();

  // --- positions ---
  const paginator = client.listPositions();
  const page = await paginator.firstPage();
  const positions = page.items as Awaited<ReturnType<typeof paginator.firstPage>>["items"];

  for (const pos of positions) {
    const tokenId = pos.tokenId ?? null;
    if (!tokenId) continue;
    const shares = pos.size != null ? parseFloat(pos.size) : 0;
    if (shares <= 0) continue;
    const avgP = pos.avgPrice != null ? parseFloat(pos.avgPrice) : 0;

    let currentPrice = pos.curPrice != null ? parseFloat(pos.curPrice) : 0;
    try {
      const mid = await pub.fetchMidpoint({ tokenId });
      currentPrice = parseFloat(mid);
    } catch {
      // fallback to curPrice already set
    }

    await db
      .insert(positionsCache)
      .values({
        tokenId,
        marketId: pos.conditionId ?? "",
        conditionId: pos.conditionId ?? "",
        outcome: pos.outcome ?? "unknown",
        side: "BUY",
        shares,
        avgPrice: avgP,
        currentPrice,
        question: pos.title ?? pos.slug ?? "",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: positionsCache.tokenId,
        set: { shares, avgPrice: avgP, currentPrice, updatedAt: new Date() },
      });

    await db.insert(priceHistory).values({ tokenId, price: currentPrice, recordedAt: new Date() });
  }

  // --- balances ---
  const bal = await fetchBalanceAllowance(client, { assetType: AssetType.COLLATERAL });
  const usdc = Number(bal.balance) / 1e6;

  const existing = await db.select().from(balancesCache).limit(1);
  if (existing.length === 0) {
    await db.insert(balancesCache).values({ usdc, updatedAt: new Date() });
  } else {
    await db.update(balancesCache).set({ usdc, updatedAt: new Date() }).where(eq(balancesCache.id, existing[0]!.id));
  }

  logger.debug({ positionCount: positions.length, usdc }, "portfolioSync complete");
}

export const portfolioSyncWorker: WorkerDef = {
  name: "portfolioSync",
  intervalMs: 5_000,
  run,
};
