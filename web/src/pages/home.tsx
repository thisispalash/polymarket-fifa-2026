import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Star } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/empty-state";

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
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">FIFA Trader</p>
        <h1 className="text-xl font-bold tracking-tight">Watchlist</h1>
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
          <EmptyState
            icon={Star}
            title="Your watchlist is empty"
            description="Star markets to track their prices here at a glance."
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

        {watchlist.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/markets/${item.marketId}`)}
            className="w-full text-left rounded-xl border bg-card p-4 space-y-2 active:scale-[0.98] transition-transform"
          >
            <p className="text-sm font-medium leading-snug line-clamp-2">{item.question}</p>
            <p className="text-xs text-muted-foreground">
              Added {new Date(item.addedAt).toLocaleDateString()}
            </p>
          </button>
        ))}
      </main>
    </div>
  );
}
