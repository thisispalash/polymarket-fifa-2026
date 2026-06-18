import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";

type WatchlistItem = {
  id: number;
  marketId: string;
  slug: string;
  question: string;
  addedAt: string;
};

export function HomePage() {
  const navigate = useNavigate();

  const { data: watchlist = [], isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ["watchlist"],
    queryFn: () => api.get<WatchlistItem[]>("/api/watchlist"),
    refetchInterval: 5_000,
  });

  return (
    <div className="min-h-screen bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* Top nav */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">FIFA Trader</h1>
        <nav className="flex gap-4 text-sm">
          <Link to="/portfolio" className="text-primary font-medium">Portfolio</Link>
          <Link to="/arbs" className="text-primary font-medium">Arbs</Link>
          <Link to="/markets" className="text-muted-foreground">Markets</Link>
        </nav>
      </header>

      <main className="px-4 py-4 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && watchlist.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-base">No markets on your watchlist yet.</p>
            <Link to="/markets" className="text-primary text-sm underline mt-2 inline-block">
              Browse markets →
            </Link>
          </div>
        )}

        {watchlist.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/markets/${item.marketId}`)}
            className="w-full text-left rounded-xl border bg-card p-4 space-y-2 active:scale-[0.98] transition-transform"
          >
            <p className="text-sm font-medium leading-snug line-clamp-2">{item.question}</p>
            {/* Sparkline placeholder — replaced by <Sparkline> in U30 */}
            <div className="h-8 bg-muted rounded" />
            <p className="text-xs text-muted-foreground">
              Added {new Date(item.addedAt).toLocaleDateString()}
            </p>
          </button>
        ))}
      </main>
    </div>
  );
}
