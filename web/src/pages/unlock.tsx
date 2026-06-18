import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function UnlockPage() {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const unlock = useMutation({
    mutationFn: () => api.post<{ unlocked: boolean }>("/api/unlock", { secret }),
    onSuccess: () => navigate("/"),
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setError(err.message || "Invalid secret");
      } else {
        setError("Something went wrong");
      }
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">FIFA Trader</h1>
          <p className="text-sm text-muted-foreground">Enter your session secret to continue</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            unlock.mutate();
          }}
          className="space-y-4"
        >
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Session secret"
            autoFocus
            className="w-full h-12 rounded-md border border-input bg-background px-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={unlock.isPending || !secret}
          >
            {unlock.isPending ? "Unlocking…" : "Unlock"}
          </Button>
        </form>
      </div>
    </div>
  );
}
