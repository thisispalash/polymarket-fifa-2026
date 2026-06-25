// Market and OrderBook types are re-exported by @polymarket/client via
// `export * from '@polymarket/bindings/gamma'` and `export * from '@polymarket/bindings/clob'`.
import type { Market as SdkMarket, OrderBook as SdkOrderBook } from "@polymarket/client";
import { getPublicClient } from "./client";
import { withTimeout, SDK_READ_TIMEOUT_MS } from "../safety/timeout";
import { logger } from "../logger";

export type { SdkMarket, SdkOrderBook };

const FIFA_KEYWORDS = ["fifa", "world cup", "world-cup"];

function isFifaMarket(m: SdkMarket): boolean {
  const haystack = [
    m.slug ?? "",
    m.question ?? "",
    m.category ?? "",
    // tags carry slug and label — both are optional strings
    ...m.tags.map((t: { slug?: string | null; label?: string | null }) => t.slug ?? ""),
    ...m.tags.map((t: { slug?: string | null; label?: string | null }) => t.label ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return FIFA_KEYWORDS.some((kw) => haystack.includes(kw));
}

export async function listFifaMarkets(opts: {
  pageSize?: number;
  cursor?: string;
}): Promise<{ items: SdkMarket[]; nextCursor: string | null }> {
  const client = getPublicClient();
  const paginator = client.listMarkets({
    closed: false,
    pageSize: opts.pageSize ?? 20,
    ...(opts.cursor ? { cursor: opts.cursor } : {}),
  });

  const page = await withTimeout(paginator.firstPage(), SDK_READ_TIMEOUT_MS, "listMarkets.firstPage");
  const items = (page.items as SdkMarket[]).filter(isFifaMarket);

  logger.debug({ count: items.length, hasMore: page.hasMore }, "listFifaMarkets");

  // nextCursor is a branded PaginationCursor — cast to plain string for JSON serialisation
  const nextCursor: string | null =
    page.hasMore && page.nextCursor ? (page.nextCursor as unknown as string) : null;

  return { items, nextCursor };
}

export async function getMarketDetail(id: string): Promise<{
  market: SdkMarket;
  outcomes: Array<{ tokenId: string; book: SdkOrderBook }>;
}> {
  const client = getPublicClient();

  // Gamma market ids are numeric strings; anything else (e.g. a position's
  // URL slug, since the position payload carries no market id) is resolved by
  // slug. fetchMarket accepts { id } | { slug } | { url }.
  const request = /^\d+$/.test(id) ? { id } : { slug: id };
  const market = await withTimeout(client.fetchMarket(request), SDK_READ_TIMEOUT_MS, `fetchMarket(${id})`);

  // outcomes.yes / outcomes.no each carry a nullable tokenId
  const outcomeTokens = (
    [market.outcomes.yes, market.outcomes.no] as Array<{
      label: string;
      tokenId: string | null;
    }>
  ).filter((o): o is { label: string; tokenId: string } => o.tokenId != null);

  const books = await Promise.all(
    outcomeTokens.map((o) =>
      withTimeout(client.fetchOrderBook({ tokenId: o.tokenId }), SDK_READ_TIMEOUT_MS, `fetchOrderBook(${o.tokenId})`),
    ),
  );

  const outcomes = outcomeTokens.map((o, i) => ({
    tokenId: o.tokenId,
    book: books[i]!,
  }));

  logger.debug({ marketId: id, outcomeCount: outcomes.length }, "getMarketDetail");

  return { market, outcomes };
}
