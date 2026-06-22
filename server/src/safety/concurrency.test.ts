import { describe, test, expect } from "bun:test";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  test("returns empty for empty input", async () => {
    const out = await mapWithConcurrency([], 4, async () => 1);
    expect(out).toEqual([]);
  });

  test("preserves order across out-of-order completion", async () => {
    const delays = [40, 10, 30, 5];
    const out = await mapWithConcurrency(delays, 4, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(out.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([0, 1, 2, 3]);
  });

  test("respects concurrency cap", async () => {
    let inflight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return n;
    });
    expect(out).toHaveLength(8);
    expect(peak).toBeLessThanOrEqual(3);
  });

  test("a throw becomes a rejected entry without failing the batch", async () => {
    const out = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("nope");
      return n * 10;
    });
    expect(out[0]).toEqual({ status: "fulfilled", value: 10 });
    expect(out[1]?.status).toBe("rejected");
    expect(out[2]).toEqual({ status: "fulfilled", value: 30 });
  });
});
