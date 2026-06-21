// AssetType is declared in @polymarket/client's d.ts (via `export *`) but the
// runtime JS bundle doesn't actually re-export it — only the bindings package
// does. Pulling it from @polymarket/bindings/clob directly so it resolves at
// module load. SDK packaging bug; revisit when beta.8 ships.
import { AssetType } from "@polymarket/bindings/clob";
import { fetchBalanceAllowance } from "@polymarket/client/actions";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { positionsCache, balancesCache, priceHistory } from "../db/schema";
import { getSecureClient, getPublicClient } from "../polymarket/client";
import { withTimeout, SDK_READ_TIMEOUT_MS } from "../safety/timeout";
import { logger } from "../logger";
import type { WorkerDef } from "./runner";

async function run(): Promise<void> {
  const client = await getSecureClient();
  const pub = getPublicClient();

  // --- positions ---
  // The SDK paginator is an AsyncIterable; `for await` drains every page.
  // `firstPage()` alone would silently hide rows beyond the first page.
  const paginator = client.listPositions();
  let positionCount = 0;

  for await (const page of paginator) {
    for (const pos of page.items) {
      const tokenId = pos.tokenId ?? null;
      if (!tokenId) continue;
      const shares = pos.size != null ? parseFloat(pos.size) : 0;
      if (shares <= 0) continue;
      positionCount += 1;
      const avgP = pos.avgPrice != null ? parseFloat(pos.avgPrice) : 0;

      let currentPrice = pos.curPrice != null ? parseFloat(pos.curPrice) : 0;
      try {
        const mid = await withTimeout(pub.fetchMidpoint({ tokenId }), SDK_READ_TIMEOUT_MS, `fetchMidpoint(${tokenId})`);
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
  }

  // --- balances ---
  const bal = await withTimeout(
    fetchBalanceAllowance(client, { assetType: AssetType.COLLATERAL }),
    SDK_READ_TIMEOUT_MS,
    "fetchBalanceAllowance",
  );
  const usdc = Number(bal.balance) / 1e6;

  const existing = await db.select().from(balancesCache).limit(1);
  if (existing.length === 0) {
    await db.insert(balancesCache).values({ usdc, updatedAt: new Date() });
  } else {
    await db.update(balancesCache).set({ usdc, updatedAt: new Date() }).where(eq(balancesCache.id, existing[0]!.id));
  }

  logger.debug({ positionCount, usdc }, "portfolioSync complete");
}

export const portfolioSyncWorker: WorkerDef = {
  name: "portfolioSync",
  intervalMs: 5_000,
  run,
};
