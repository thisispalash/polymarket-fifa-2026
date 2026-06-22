// Bounded-concurrency map. `limit` workers pull from a shared index until
// every item is consumed. Each invocation of `fn` is independently caught
// — a throw becomes the corresponding entry in the result array (status:
// "rejected") instead of failing the whole batch, mirroring the semantics
// of Promise.allSettled.
//
// Use this for SDK fan-out (fetchOrder per pending order, fetchMidpoint
// per position, etc) where serial `for ... await` parks the worker on
// network latency × N.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return [];
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        try {
          const value = await fn(items[i]!, i);
          results[i] = { status: "fulfilled", value };
        } catch (reason) {
          results[i] = { status: "rejected", reason };
        }
      }
    }),
  );
  return results;
}
