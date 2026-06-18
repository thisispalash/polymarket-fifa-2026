import { describe, test, expect } from "bun:test";
import { detect, computeStakes } from "./dutchArb";

describe("dutchArb", () => {
  // 1. Three-way arb: sum = 0.9, margin 1% → detect non-null, stakes sum ≈ budget
  test("detects 3-way arb and stakes sum to budget", () => {
    const prices = [0.3, 0.3, 0.3];
    const opp = detect(prices, 0.01);
    expect(opp).not.toBeNull();
    expect(opp!.edgePct).toBeGreaterThan(0);

    const result = computeStakes(prices, 100);
    expect(result).not.toBeNull();
    expect(result!.profit).toBeGreaterThan(0);
    const stakeSum = result!.stakes.reduce((a, b) => a + b, 0);
    expect(Math.abs(stakeSum - 100)).toBeLessThan(0.001);
  });

  // 2. Binary 50/50: sum = 1.0, no edge at margin 1%
  test("returns null when sum equals 1.0", () => {
    expect(detect([0.5, 0.5], 0.01)).toBeNull();
    expect(computeStakes([0.5, 0.5], 100)).toBeNull();
  });

  // 3. Three-way: sum = 0.99, edge ≈ 1%
  test("edgePct ≈ 1.0 for sum=0.99", () => {
    const opp = detect([0.4, 0.45, 0.14], 0.005);
    expect(opp).not.toBeNull();
    expect(Math.abs(opp!.edgePct - 1.0)).toBeLessThan(0.01);
  });

  // 4. Over-sum: sum = 1.2 → both functions return null
  test("returns null when sum > 1.0", () => {
    expect(detect([0.6, 0.6], 0.01)).toBeNull();
    expect(computeStakes([0.6, 0.6], 100)).toBeNull();
  });

  // 5. Equal-profit invariant: payout on each outcome equals budget + profit
  test("equal-profit invariant holds across outcomes", () => {
    const prices = [0.5, 0.4];
    const result = computeStakes(prices, 100);
    expect(result).not.toBeNull();
    const { stakes, profit } = result!;
    const payouts = prices.map((p, i) => (stakes[i] ?? 0) / p);
    for (const payout of payouts) {
      expect(payout - 100).toBeGreaterThanOrEqual(0);
    }
    // All payouts are equal within 0.001
    const first = payouts[0] ?? 0;
    for (const payout of payouts) {
      expect(Math.abs(payout - first)).toBeLessThan(0.001);
    }
    expect(profit).toBeGreaterThan(0);
  });
});
