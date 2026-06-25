import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  const pnlColor = s.realizedPnl >= 0 ? "text-profit" : "text-loss";

  return (
    <div className={cn("rounded-xl border bg-card p-4 space-y-3", !s.enabled && "opacity-60")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{STRATEGY_LABELS[s.kind]}</h2>
        <Switch
          checked={s.enabled}
          onCheckedChange={(v) => toggle.mutate(v)}
          disabled={toggle.isPending}
          aria-label={`Enable ${STRATEGY_LABELS[s.kind]} strategy`}
        />
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
            <Switch
              checked={s.autoExecute}
              onCheckedChange={(v) => setAutoExecute.mutate(v)}
              disabled={setAutoExecute.isPending}
              aria-label={`Auto-execute ${STRATEGY_LABELS[s.kind]}`}
              className="mt-1"
            />
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
          aria-label={`Capital cap in USDC for ${STRATEGY_LABELS[s.kind]}`}
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
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <h1 className="text-xl font-bold tracking-tight">Strategies</h1>
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
