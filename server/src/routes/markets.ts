import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "../db/client";
import { priceHistory } from "../db/schema";
import { listFifaMarkets, getMarketDetail } from "../polymarket/markets";
import type { SdkMarket } from "../polymarket/markets";
import type { Market } from "@fifa/shared";

const listQuery = z.object({
  // stage (group|knockout) is a no-op in v1 — SDK carries no stage info
  stage: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

function toDto(m: SdkMarket): Market {
  const rawOutcomes = [m.outcomes.yes, m.outcomes.no] as Array<{
    label: string; tokenId: string | null; price: string | null;
  }>;
  const outcomes = rawOutcomes
    .filter((o): o is typeof o & { tokenId: string } => o.tokenId != null)
    .map((o) => ({ tokenId: o.tokenId, outcome: o.label, price: o.price != null ? parseFloat(o.price) : 0 }));

  return {
    id: m.id as unknown as string,
    conditionId: (m.conditionId as string | null) ?? "",
    slug: m.slug ?? "",
    question: m.question ?? "",
    description: m.description ?? undefined,
    category: m.category ?? undefined,
    endDateIso: m.state.endDate ?? undefined,
    active: m.state.active ?? false,
    closed: m.state.closed ?? false,
    archived: m.state.archived ?? false,
    volume: m.metrics.volumeNum != null ? parseFloat(m.metrics.volumeNum) : undefined,
    liquidity: m.metrics.liquidityNum != null ? parseFloat(m.metrics.liquidityNum) : undefined,
    outcomes,
  };
}

export async function marketsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/markets", async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.send(app.httpErrors.badRequest(parsed.error.message));
    const { pageSize, cursor } = parsed.data;
    const { items, nextCursor } = await listFifaMarkets({ pageSize, cursor });
    return { items: items.map(toDto), nextCursor };
  });

  // Sparkline data source — recent price samples written by
  // portfolioSync. Returns ascending by time so the line renders
  // left-to-right without re-sorting on the client.
  const historyQuery = z.object({
    hours: z.coerce.number().int().min(1).max(168).default(24),
  });
  app.get<{ Params: { tokenId: string } }>("/price-history/:tokenId", async (request, reply) => {
    const { tokenId } = request.params;
    if (!tokenId) return reply.send(app.httpErrors.badRequest("tokenId required"));
    const parsed = historyQuery.safeParse(request.query);
    if (!parsed.success) return reply.send(app.httpErrors.badRequest(parsed.error.message));
    const since = new Date(Date.now() - parsed.data.hours * 60 * 60 * 1_000);
    const rows = await db
      .select({ price: priceHistory.price, recordedAt: priceHistory.recordedAt })
      .from(priceHistory)
      .where(and(eq(priceHistory.tokenId, tokenId), gt(priceHistory.recordedAt, since)))
      .orderBy(asc(priceHistory.recordedAt));
    return rows.map((r) => ({ price: r.price, t: r.recordedAt.toISOString() }));
  });

  app.get<{ Params: { id: string } }>("/markets/:id", async (request, reply) => {
    const { id } = request.params;
    if (!id) return reply.send(app.httpErrors.badRequest("id required"));
    const { market, outcomes } = await getMarketDetail(id);
    const labelByTokenId = new Map<string, string>();
    for (const slot of [market.outcomes.yes, market.outcomes.no] as Array<{
      label: string; tokenId: string | null;
    }>) {
      if (slot.tokenId) labelByTokenId.set(slot.tokenId, slot.label);
    }
    return {
      id: market.id as unknown as string,
      slug: market.slug ?? "",
      question: market.question ?? "",
      conditionId: (market.conditionId as string | null) ?? "",
      active: market.state.active ?? false,
      closed: market.state.closed ?? false,
      outcomes: outcomes.map((o) => ({
        tokenId: o.tokenId,
        name: labelByTokenId.get(o.tokenId) ?? "",
        bestBid: o.book.bids[0]?.price ?? null,
        bestAsk: o.book.asks[0]?.price ?? null,
        book: { bids: o.book.bids, asks: o.book.asks, minOrderSize: o.book.minOrderSize, tickSize: o.book.tickSize },
      })),
    };
  });
}
