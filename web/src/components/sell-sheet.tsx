import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import { api, newClientOrderId } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SubmitOrderInput } from "@fifa/shared";

type Position = {
  tokenId: string;
  shares: number;
  currentPrice: number;
  outcome: string;
  question: string;
};

type Props = {
  position: Position;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

type Chip = { label: string; pct: number };

const CHIPS: Chip[] = [
  { label: "25%", pct: 0.25 },
  { label: "50%", pct: 0.5 },
  { label: "100%", pct: 1.0 },
];

export function SellSheet({ position, open, onClose, onSuccess }: Props) {
  const [selectedPct, setSelectedPct] = useState<number>(1.0);
  const [limitPrice, setLimitPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Stable for the lifetime of one open-sheet session. Two taps before the
  // server has a chance to reply collapse to the same backend order. Reset
  // on close via key remount (parent passes new `position`).
  const [clientOrderId] = useState(() => newClientOrderId());

  const size = parseFloat((position.shares * selectedPct).toFixed(4));

  const submitOrder = useMutation({
    mutationFn: (input: SubmitOrderInput) => api.post("/api/orders", input),
    onSuccess: () => {
      setError(null);
      onSuccess?.();
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Order failed");
    },
  });

  const handleSubmit = (pct: number, useLimit = false) => {
    const qty = parseFloat((position.shares * pct).toFixed(4));
    const input: SubmitOrderInput = {
      tokenId: position.tokenId,
      side: "SELL",
      type: useLimit ? "LIMIT" : "MARKET",
      size: qty,
      price: useLimit && limitPrice ? parseFloat(limitPrice) : undefined,
      clientOrderId,
    };
    submitOrder.mutate(input);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl p-6 pb-[env(safe-area-inset-bottom)] space-y-4 shadow-xl">
          <Dialog.Title className="text-base font-semibold">
            Sell {position.outcome} — {position.shares.toFixed(2)} shares
          </Dialog.Title>
          <p className="text-xs text-muted-foreground line-clamp-1">{position.question}</p>

          {/* Quick market-sell chips */}
          <div className="flex gap-2">
            {CHIPS.map((chip) => (
              <button
                key={chip.pct}
                onClick={() => {
                  setSelectedPct(chip.pct);
                  setError(null);
                  handleSubmit(chip.pct);
                }}
                disabled={submitOrder.isPending}
                className={cn(
                  "flex-1 h-11 rounded-lg border text-sm font-medium transition-colors active:scale-95",
                  selectedPct === chip.pct
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-input hover:bg-muted"
                )}
              >
                {chip.label} market
              </button>
            ))}
          </div>

          {/* Limit row */}
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={`Limit at ${position.currentPrice.toFixed(2)}`}
              step="0.01"
              min="0.01"
              max="0.99"
              className="flex-1 h-11 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              variant="outline"
              onClick={() => { setError(null); handleSubmit(selectedPct, true); }}
              disabled={!limitPrice || submitOrder.isPending}
              className="shrink-0"
            >
              Limit {(size).toFixed(2)} sh
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button variant="ghost" className="w-full" onClick={onClose}>Cancel</Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
