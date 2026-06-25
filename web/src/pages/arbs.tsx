import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type { ArbOpportunity } from "@fifa/shared";

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function ArbRow({ opp }: { opp: ArbOpportunity }) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  const capital = opp.stakes.reduce((sum, s) => sum + s.cost, 0);
  const profit = capital * ((1 - opp.sumPrice) / opp.sumPrice);

  const execute = useMutation({
    mutationFn: () => api.post(`/api/arb/execute/${opp.id}`),
    onSuccess: () => {
      setConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: ["arb-opportunities"] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError ? err.message : "Execute failed";
      setExecError(msg);
    },
  });

  return (
    <div className={cn("rounded-xl border bg-card p-4 space-y-2", opp.executed && "opacity-50")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">
            {opp.question || opp.marketId}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs font-semibold">
              Σ {opp.sumPrice.toFixed(3)}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
              {opp.edgePct.toFixed(2)}% edge
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo(opp.detectedAt)}</span>
          </div>
        </div>
        {opp.executed ? (
          <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground">
            Executed
          </span>
        ) : (
          <Button size="sm" onClick={() => { setExecError(null); setConfirmOpen(true); }}>
            Execute
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Required capital</p>
          <p className="font-semibold tabular-nums">${capital.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Expected profit</p>
          <p className="font-semibold tabular-nums text-profit">+${profit.toFixed(2)}</p>
        </div>
      </div>

      {execError && (
        <p className="text-xs text-destructive">{execError}</p>
      )}

      {confirmOpen && (
        <div className="rounded-lg border bg-muted p-3 space-y-2">
          <p className="text-sm font-medium">Confirm execution</p>
          <p className="text-xs text-muted-foreground">
            Deploy ${capital.toFixed(2)} across {opp.stakes.length} legs for ~${profit.toFixed(2)} profit.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={execute.isPending}
              onClick={() => execute.mutate()}
            >
              {execute.isPending ? "Executing…" : "Confirm"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ArbsPage() {
  const { data = [], isLoading } = useQuery<ArbOpportunity[]>({
    queryKey: ["arb-opportunities"],
    queryFn: () => api.get<ArbOpportunity[]>("/api/arb/opportunities"),
    refetchInterval: 5_000,
  });

  return (
    <div className="min-h-screen bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <h1 className="text-xl font-bold tracking-tight">Arb Opportunities</h1>
      </header>

      <main className="px-4 py-4 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
          </div>
        )}
        {!isLoading && data.length === 0 && (
          <EmptyState
            icon={ArrowLeftRight}
            title="No opportunities detected"
            description="Arb scans run continuously — new edges will appear here as they're found."
          />
        )}
        {data.map((opp) => <ArbRow key={opp.id} opp={opp} />)}
      </main>
    </div>
  );
}
