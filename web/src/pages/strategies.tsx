import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  STRATEGY_KINDS,
  STRATEGY_LABELS,
  type StrategyConfig,
  type StrategyKind,
} from "@fifa/shared";

function StrategyCard({ s }: { s: StrategyConfig }) {
  const qc = useQueryClient();
  const [cap, setCap] = useState(String(s.capitalCap));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["strategies"] });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api.post(`/api/strategies/${s.id}/toggle`, { enabled }),
    onSuccess: invalidate,
  });

  const allocate = useMutation({
    mutationFn: (capitalCap: number) =>
      api.post(`/api/strategies/${s.id}/allocate`, { capitalCap }),
    onSuccess: invalidate,
  });

  const setAutoExecute = useMutation({
    mutationFn: (autoExecute: boolean) =>
      api.post(`/api/strategies/${s.id}/auto-execute`, { autoExecute }),
    onSuccess: invalidate,
  });

  const isArb = (s.kind === "dutch_arb" || s.kind === "yesno_arb") as boolean;
  const pnlColor = s.realizedPnl >= 0 ? "text-green-600" : "text-red-600";

  return (
    <div className={cn("rounded-xl border bg-card p-4 space-y-3", !s.enabled && "opacity-60")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{STRATEGY_LABELS[s.kind]}</h2>
        <button
          role="switch"
          aria-checked={s.enabled}
          onClick={() => toggle.mutate(!s.enabled)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none",
            s.enabled ? "bg-primary" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
              s.enabled ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Realized PnL</p>
          <p className={cn("font-semibold tabular-nums", pnlColor)}>
            {s.realizedPnl >= 0 ? "+" : ""}${s.realizedPnl.toFixed(2)}
          </p>
        </div>
        {isArb && (
          <div>
            <p className="text-muted-foreground">Auto-execute</p>
            <button
              role="switch"
              aria-checked={s.autoExecute}
              onClick={() => setAutoExecute.mutate(!s.autoExecute)}
              disabled={setAutoExecute.isPending}
              className={cn(
                "mt-1 relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50",
                s.autoExecute ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow ring-0 transition-transform",
                  s.autoExecute ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          step={10}
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          className="w-24 rounded-md border bg-background px-2 py-1 text-sm tabular-nums"
          placeholder="Cap $"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={allocate.isPending}
          onClick={() => {
            const v = parseFloat(cap);
            if (!isNaN(v) && v >= 0) allocate.mutate(v);
          }}
        >
          Save cap
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">USDC cap</span>
      </div>
    </div>
  );
}

type StrategiesResponse = StrategyConfig[];

export function StrategiesPage() {
  const { data, isLoading } = useQuery<StrategiesResponse>({
    queryKey: ["strategies"],
    queryFn: () => api.get<StrategiesResponse>("/api/strategies"),
    refetchInterval: 15_000,
  });

  const ordered: StrategyConfig[] = STRATEGY_KINDS.flatMap((kind: StrategyKind) => {
    const found = data?.find((s) => s.kind === kind);
    return found ? [found] : [];
  });

  return (
    <div className="min-h-screen bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">Strategies</h1>
        <Link to="/" className="text-sm text-primary">← Home</Link>
      </header>

      <main className="px-4 py-4 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}
        {ordered.map((s) => <StrategyCard key={s.id} s={s} />)}
      </main>
    </div>
  );
}
