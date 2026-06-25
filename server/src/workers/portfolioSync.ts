// AssetType is declared in @polymarket/client's d.ts (via `export *`) but the
// runtime JS bundle doesn't actually re-export it — only the bindings package
// does. Pulling it from @polymarket/bindings/clob directly so it resolves at
// module load. SDK packaging bug; revisit when beta.8 ships.
import { AssetType } from "@polymarket/bindings/clob";
import { fetchBalanceAllowance } from "@polymarket/client/actions";
import { eq, lt, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import { positionsCache, balancesCache, priceHistory } from "../db/schema";
import { getSecureClient, getPublicClient } from "../polymarket/client";
import { withTimeout, SDK_READ_TIMEOUT_MS } from "../safety/timeout";
import { logger } from "../logger";
import type { WorkerDef } from "./runner";

// Down-sample price writes so we get usable sparkline data without the
// 17k-rows/day-per-position blowup that motivated P1 #21. One row per
// minute per token is plenty for a 24h sparkline.
const PRICE_SAMPLE_INTERVAL_MS = 60_000;
// Retention horizon: 7d is far enough to cover the sparkline range and
// short enough that priceHistory stays small on a personal-scale DB.
const PRICE_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const lastSampleAt = new Map<string, number>();
let lastRetentionAt = 0;

async function run(): Promise<void> {
  const client = await getSecureClient();
  const pub = getPublicClient();

  // --- positions ---
  // The SDK paginator is an AsyncIterable; `for await` drains every page.
  // `firstPage()` alone would silently hide rows beyond the first page.
  const paginator = client.listPositions();
  let positionCount = 0;
  // Track tokenIds the wallet still holds so we can drop the rest from the
  // cache after the sync (see reconcile sweep below).
  const seen = new Set<string>();

  for await (const page of paginator) {
    for (const pos of page.items) {
      const tokenId = pos.tokenId ?? null;
      if (!tokenId) continue;
      const shares = pos.size != null ? parseFloat(pos.size) : 0;
      if (shares <= 0) continue;
      positionCount += 1;
      seen.add(tokenId);
      const avgP = pos.avgPrice != null ? parseFloat(pos.avgPrice) : 0;

      let currentPrice = pos.curPrice != null ? parseFloat(pos.curPrice) : 0;
      try {
        const mid = await withTimeout(pub.fetchMidpoint({ tokenId }), SDK_READ_TIMEOUT_MS, `fetchMidpoint(${tokenId})`);
        currentPrice = parseFloat(mid);
      } catch (err) {
        // Stale-price fallback. Log so the operator can spot a degraded
        // orderbook feed instead of TP/SL silently firing off curPrice.
        logger.debug({ tokenId, err }, "portfolioSync: fetchMidpoint failed; using stale curPrice");
      }

      // Sparkline sampler. Skip when we already wrote a point for this
      // token within the throttle window. Errors stay quiet — the price
      // history is a UX nicety, not load-bearing for any trading path.
      const lastAt = lastSampleAt.get(tokenId) ?? 0;
      const now = Date.now();
      if (currentPrice > 0 && now - lastAt >= PRICE_SAMPLE_INTERVAL_MS) {
        lastSampleAt.set(tokenId, now);
        try {
          await db.insert(priceHistory).values({ tokenId, price: currentPrice });
        } catch (err) {
          logger.debug({ tokenId, err }, "portfolioSync: priceHistory insert failed");
        }
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
          slug: pos.slug ?? "",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: positionsCache.tokenId,
          set: { shares, avgPrice: avgP, currentPrice, slug: pos.slug ?? "", updatedAt: new Date() },
        });
    }
  }

  // Reconcile: drop cache rows for positions the wallet no longer holds.
  // listPositions only returns open positions, and the loop skips size<=0,
  // so without this a sold/closed position lingers forever with stale shares
  // and a frozen price — the root cause of "the portfolio cards are wrong".
  // Only runs if the loop completed (a thrown SDK error aborts run() before
  // here), so an empty result is an authoritative "no open positions", not a
  // transient failure that would wrongly wipe the cache.
  if (seen.size === 0) {
    await db.delete(positionsCache);
  } else {
    await db.delete(positionsCache).where(notInArray(positionsCache.tokenId, [...seen]));
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

  // Retention sweep. Folded into portfolioSync (vs a separate worker)
  // so we don't spawn a tick just to delete a handful of rows. Run at
  // most hourly — a few thousand stale rows lingering doesn't matter.
  const now = Date.now();
  if (now - lastRetentionAt > 60 * 60 * 1_000) {
    lastRetentionAt = now;
    try {
      const cutoff = new Date(now - PRICE_RETENTION_MS);
      const deleted = await db
        .delete(priceHistory)
        .where(lt(priceHistory.recordedAt, cutoff))
        .returning({ id: priceHistory.id });
      if (deleted.length > 0) {
        logger.info({ deleted: deleted.length }, "portfolioSync: priceHistory retention sweep");
      }
    } catch (err) {
      logger.warn({ err }, "portfolioSync: priceHistory retention sweep failed");
    }
  }

  logger.debug({ positionCount, usdc }, "portfolioSync complete");
}

export const portfolioSyncWorker: WorkerDef = {
  name: "portfolioSync",
  intervalMs: 5_000,
  run,
};
