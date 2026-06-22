import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { Market } from "@fifa/shared";

type MarketsResponse = {
  items: Market[];
  nextCursor?: string;
};

export function MarketsPage() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const { data, isLoading } = useQuery<MarketsResponse>({
    queryKey: ["markets"],
    queryFn: () => api.get<MarketsResponse>("/api/markets?pageSize=50"),
    staleTime: 30_000,
  });

  const items = data?.items ?? [];
  const filtered = search
    ? items.filter((m) => m.question.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="min-h-screen bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <h1 className="text-lg font-bold mb-2">Markets</h1>
        <input
          type="search"
          placeholder="Search markets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </header>

      <main className="divide-y">
        {isLoading && (
          <div className="space-y-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse border-b" />
            ))}
          </div>
        )}

        {filtered.map((m) => {
          const yes = m.outcomes.find((o) => o.outcome === "Yes") ?? m.outcomes[0];
          const price = yes?.price ?? null;

          return (
            <button
              key={m.id}
              onClick={() => navigate(`/markets/${m.id}`)}
              className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-muted/50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug line-clamp-2">{m.question}</p>
                {m.category && (
                  <p className="text-xs text-muted-foreground mt-0.5">{m.category}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                {price !== null ? (
                  <span className="text-base font-semibold tabular-nums">
                    {(price * 100).toFixed(0)}¢
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </button>
          );
        })}

        {!isLoading && filtered.length === 0 && (
          <p className="text-center py-16 text-muted-foreground text-sm">No markets found.</p>
        )}
      </main>
    </div>
  );
}
