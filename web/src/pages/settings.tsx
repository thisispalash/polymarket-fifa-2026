import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WorkerHealth = {
  name: string;
  lastRunOk: boolean;
  lastRunAt: string | null;
  lastError: string | null;
};

type HealthResponse = {
  ok: boolean;
  db: string;
  workers?: WorkerHealth[];
};

type KillSwitchResponse = {
  enabled: boolean;
  reason: string | null;
  triggeredAt: string | null;
  updatedAt: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString();
}

export function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [killConfirm, setKillConfirm] = useState(false);
  const [killReason, setKillReason] = useState("");

  const { data: health } = useQuery<HealthResponse>({
    queryKey: ["healthz"],
    queryFn: () => fetch("/api/healthz").then((r) => r.json()) as Promise<HealthResponse>,
    refetchInterval: 10_000,
  });

  const { data: ks } = useQuery<KillSwitchResponse>({
    queryKey: ["kill-switch"],
    queryFn: () => api.get<KillSwitchResponse>("/api/kill-switch"),
    refetchInterval: 10_000,
  });

  const activateKill = useMutation({
    mutationFn: (reason: string) =>
      api.post("/api/kill-switch", { enabled: true, reason: reason || undefined }),
    onSuccess: () => {
      setKillConfirm(false);
      void qc.invalidateQueries({ queryKey: ["kill-switch"] });
    },
  });

  const deactivateKill = useMutation({
    mutationFn: () => api.post("/api/kill-switch", { enabled: false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["kill-switch"] });
      void qc.invalidateQueries({ queryKey: ["healthz"] });
    },
  });

  return (
    <div className="min-h-screen bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">Settings</h1>
        <Link to="/" className="text-sm text-primary">← Home</Link>
      </header>

      <main className="px-4 py-4 space-y-4">

        {/* System health */}
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">System health</h2>
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", health?.ok ? "bg-green-500" : "bg-red-500")} />
            <span className="text-xs">{health?.ok ? "OK" : "Degraded"}</span>
            <span className="text-xs text-muted-foreground ml-auto">DB: {health?.db ?? "—"}</span>
          </div>
          {(health?.workers ?? []).length > 0 && (
            <div className="divide-y text-xs">
              {health!.workers!.map((w) => (
                <div key={w.name} className="flex items-center py-1.5 gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", w.lastRunOk ? "bg-green-500" : "bg-red-500")} />
                  <span className="flex-1 font-mono">{w.name}</span>
                  <span className="text-muted-foreground">{fmt(w.lastRunAt)}</span>
                  {w.lastError && (
                    <span className="text-red-600 truncate max-w-[120px]">{w.lastError}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Kill switch */}
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Kill switch</h2>
          {ks?.enabled ? (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm">
              <p className="font-semibold text-red-700">Kill switch ACTIVE</p>
              {ks.reason && <p className="text-red-600 text-xs mt-0.5">{ks.reason}</p>}
              {ks.triggeredAt && (
                <p className="text-red-500 text-xs mt-0.5">Triggered {fmt(ks.triggeredAt)}</p>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-green-50 border border-green-200 p-2 text-xs text-green-700 font-medium">
              All clear — no kill switch active
            </div>
          )}

          {ks?.enabled && (
            <Button
              variant="outline"
              className="w-full"
              disabled={deactivateKill.isPending}
              onClick={() => deactivateKill.mutate()}
            >
              {deactivateKill.isPending ? "Deactivating…" : "Deactivate kill switch (workers will restart)"}
            </Button>
          )}

          {!ks?.enabled && !killConfirm && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setKillConfirm(true)}
            >
              ACTIVATE KILL SWITCH
            </Button>
          )}

          {killConfirm && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Reason (optional)"
                value={killReason}
                onChange={(e) => setKillReason(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={activateKill.isPending}
                  onClick={() => activateKill.mutate(killReason)}
                >
                  {activateKill.isPending ? "Activating…" : "Confirm — kill all"}
                </Button>
                <Button variant="outline" onClick={() => setKillConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Session */}
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Session</h2>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate("/unlock")}
          >
            Re-lock (return to unlock screen)
          </Button>
          <p className="text-xs text-muted-foreground">
            Session cookie is HttpOnly — it cannot be cleared from the browser. Re-locking just returns you to the unlock page.
          </p>
        </section>

        {/* Re-init creds */}
        <section className="rounded-xl border bg-card p-4 space-y-2">
          <h2 className="text-sm font-semibold">Re-bootstrap credentials</h2>
          <Button variant="outline" className="w-full" disabled>
            Re-derive L2 creds (planned)
          </Button>
          <p className="text-xs text-muted-foreground">Not wired in v1.</p>
        </section>

      </main>
    </div>
  );
}
