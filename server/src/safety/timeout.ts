// Promise.race-style timeout for SDK reads. Safe for idempotent fetches:
// the underlying request may still complete after we reject, but a late
// resolution is discarded harmlessly. Do NOT wrap writes (placeOrder,
// cancelOrder) — a late landing on the exchange after a thrown timeout
// produces an orphan we can't see, and that needs a different mitigation.
export class SdkTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`SDK call timed out after ${ms}ms: ${label}`);
    this.name = "SdkTimeoutError";
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SdkTimeoutError(label, ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export const SDK_READ_TIMEOUT_MS = 8_000;
