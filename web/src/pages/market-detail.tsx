import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/sparkline";
import { queryClient } from "@/lib/queryClient";
import type { SubmitOrderInput } from "@fifa/shared";

type DetailOutcome = {
  tokenId: string;
  name: string;
  bestBid: number | null;
  bestAsk: number | null;
};

type MarketDetail = {
  id: string;
  question: string;
  conditionId: string;
  active: boolean;
  closed: boolean;
  outcomes: DetailOutcome[];
};

type WatchlistItem = { id: number; marketId: string; slug: string; question: string; addedAt: string };

export function MarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyOutcome, setBuyOutcome] = useState<DetailOutcome | null>(null);
  const [size, setSize] = useState("10");
  const [limitPrice, setLimitPrice] = useState("");
  const [orderError, setOrderError] = useState<string | null>(null);

  const { data: market, isLoading } = useQuery<MarketDetail>({
    queryKey: ["market-detail", id],
    queryFn: () => api.get<MarketDetail>(`/api/markets/${id}`),
    enabled: !!id,
  });

  const { data: watchlist = [] } = useQuery<WatchlistItem[]>({
    queryKey: ["watchlist"],
    queryFn: () => api.get<WatchlistItem[]>("/api/watchlist"),
  });

  const inWatchlist = watchlist.some((w) => w.marketId === id);

  const toggleWatch = useMutation({
    mutationFn: () =>
      inWatchlist
        ? api.del(`/api/watchlist/${id}`)
        : api.post(`/api/watchlist/${id}`, { slug: market?.id ?? "", question: market?.question ?? "", conditionId: market?.conditionId ?? "" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const submitOrder = useMutation({
    mutationFn: (input: SubmitOrderInput) => api.post("/api/orders", input),
    onSuccess: () => {
      setBuyOpen(false);
      setOrderError(null);
    },
    onError: (err: unknown) => {
      setOrderError(err instanceof Error ? err.message : "Order failed");
    },
  });

  if (isLoading) {
    return <div className="p-4 text-muted-foreground text-sm">Loading…</div>;
  }
  if (!market) {
    return <div className="p-4">Market not found.</div>;
  }

  const handleBuy = (outcome: DetailOutcome) => {
    setBuyOutcome(outcome);
    setSize("10");
    setLimitPrice("");
    setOrderError(null);
    setBuyOpen(true);
  };

  const handleSubmitOrder = () => {
    if (!buyOutcome) return;
    const input: SubmitOrderInput = {
      tokenId: buyOutcome.tokenId,
      side: "BUY",
      type: limitPrice ? "LIMIT" : "MARKET",
      size: parseFloat(size),
      price: limitPrice ? parseFloat(limitPrice) : undefined,
    };
    submitOrder.mutate(input);
  };

  return (
    <div className="min-h-screen bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-primary text-sm">← Back</button>
        <h1 className="flex-1 text-sm font-semibold leading-snug line-clamp-1">{market.question}</h1>
        <Button size="sm" variant="outline" onClick={() => toggleWatch.mutate()}>
          {inWatchlist ? "★ Saved" : "☆ Watch"}
        </Button>
      </header>

      <div className="px-4 pt-4 pb-2">
        <Sparkline marketId={market.id} height={150} />
      </div>

      <div className="px-4 py-3">
        <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Outcomes</h2>
        <div className="rounded-xl border divide-y overflow-hidden">
          {market.outcomes.map((o) => (
            <div key={o.tokenId} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 text-sm font-medium">{o.name || o.tokenId.slice(0, 8)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                Bid {o.bestBid != null ? (o.bestBid * 100).toFixed(1) + "¢" : "—"}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                Ask {o.bestAsk != null ? (o.bestAsk * 100).toFixed(1) + "¢" : "—"}
              </span>
              <Button size="sm" onClick={() => handleBuy(o)} disabled={market.closed}>
                Buy
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Buy Sheet via Radix Dialog */}
      <Dialog.Root open={buyOpen} onOpenChange={setBuyOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl p-6 pb-[env(safe-area-inset-bottom)] space-y-4 shadow-xl">
            <Dialog.Title className="text-base font-semibold">
              Buy {buyOutcome?.name}
            </Dialog.Title>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Size (USDC)</label>
                <input
                  type="number"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  min="1"
                  className="w-full h-11 rounded-md border border-input bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Limit price (optional)</label>
                <input
                  type="number"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder="Leave blank for market order"
                  step="0.01"
                  min="0.01"
                  max="0.99"
                  className="w-full h-11 rounded-md border border-input bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {orderError && <p className="text-sm text-destructive">{orderError}</p>}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setBuyOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSubmitOrder} disabled={submitOrder.isPending}>
                {submitOrder.isPending ? "Submitting…" : "Submit order"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
