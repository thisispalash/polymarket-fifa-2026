import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SellSheet } from "@/components/sell-sheet";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

type PortfolioPosition = {
  id: number;
  tokenId: string;
  marketId: string;
  conditionId: string;
  outcome: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  question: string;
  slug: string;
  costBasis: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  updatedAt: string;
};

type Balances = {
  usdc: number;
  totalCostBasis: number;
  totalCurrentValue: number;
  totalUnrealizedPnl: number;
};

type PortfolioResponse = {
  positions: PortfolioPosition[];
  balances: Balances;
  asOf: string | null;
};

function fmt$(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2);
}

export function PortfolioPage() {
  const [sellPos, setSellPos] = useState<PortfolioPosition | null>(null);

  const { data, isLoading, refetch } = useQuery<PortfolioResponse>({
    queryKey: ["portfolio"],
    queryFn: () => api.get<PortfolioResponse>("/api/portfolio"),
    refetchInterval: 10_000,
  });

  const { positions = [], balances } = data ?? {};

  return (
    <div className="min-h-screen bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <h1 className="text-xl font-bold tracking-tight">Portfolio</h1>
      </header>

      {/* Balance summary — one hero panel, not four equal cards */}
      {balances && (
        <div className="px-4 py-4">
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Account value</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-3xl font-bold tabular-nums tracking-tight">
                ${(balances.usdc + balances.totalCurrentValue).toFixed(2)}
              </span>
              <span className={cn("text-sm font-semibold tabular-nums",
                balances.totalUnrealizedPnl >= 0 ? "text-profit" : "text-loss"
              )}>
                {fmt$(balances.totalUnrealizedPnl)}
                {balances.totalCostBasis > 0 &&
                  ` (${fmt$((balances.totalUnrealizedPnl / balances.totalCostBasis) * 100)}%)`}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-center">
              <div>
                <p className="text-[11px] text-muted-foreground">Available</p>
                <p className="text-sm font-semibold tabular-nums">${balances.usdc.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Exposure</p>
                <p className="text-sm font-semibold tabular-nums">${balances.totalCostBasis.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Positions</p>
                <p className="text-sm font-semibold tabular-nums">{positions.length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="px-4 pb-8 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
          </div>
        )}

        {!isLoading && positions.length === 0 && (
          <EmptyState
            icon={Wallet}
            title="No open positions"
            description="Positions you buy will show up here with live PnL."
            action={
              <Link
                to="/markets"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary"
              >
                Browse markets
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
        )}

        {positions.map((p) => (
          <div key={p.id} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-start gap-2">
              <Link
                to={`/markets/${p.slug || p.marketId}`}
                className="flex-1 text-sm font-medium leading-snug line-clamp-2 hover:underline"
              >
                {p.question}
              </Link>
              <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {p.outcome}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Shares</p>
                <p className="text-sm font-semibold tabular-nums">{p.shares.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg cost</p>
                <p className="text-sm font-semibold tabular-nums">{(p.avgPrice * 100).toFixed(1)}¢</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mark</p>
                <p className="text-sm font-semibold tabular-nums">{(p.currentPrice * 100).toFixed(1)}¢</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">PnL</p>
                <p className={cn("text-sm font-semibold tabular-nums",
                  p.unrealizedPnl >= 0 ? "text-profit" : "text-loss"
                )}>
                  {fmt$(p.unrealizedPnl)}
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setSellPos(p)}
            >
              Sell
            </Button>
          </div>
        ))}
      </main>

      {sellPos && (
        <SellSheet
          position={sellPos}
          open={!!sellPos}
          onClose={() => setSellPos(null)}
          onSuccess={() => { void refetch(); }}
        />
      )}
    </div>
  );
}
