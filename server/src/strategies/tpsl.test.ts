import { describe, test, expect } from "bun:test";
import { shouldFire, buildSellOrder } from "./tpsl";
import type { TpSlRule } from "@fifa/shared";

describe("tpsl.shouldFire", () => {
  test("returns tp when mark >= takeProfit", () => {
    const rule: TpSlRule = { takeProfit: 0.8 };
    expect(shouldFire(rule, 0.8)).toBe("tp");
    expect(shouldFire(rule, 0.9)).toBe("tp");
  });

  test("returns sl when mark <= stopLoss", () => {
    const rule: TpSlRule = { stopLoss: 0.2 };
    expect(shouldFire(rule, 0.2)).toBe("sl");
    expect(shouldFire(rule, 0.1)).toBe("sl");
  });

  test("returns null when no bound triggered", () => {
    const rule: TpSlRule = { takeProfit: 0.8, stopLoss: 0.2 };
    expect(shouldFire(rule, 0.5)).toBeNull();
  });

  test("tp takes precedence over sl when both could fire", () => {
    const rule: TpSlRule = { takeProfit: 0.1, stopLoss: 0.9 };
    expect(shouldFire(rule, 0.5)).toBe("tp");
  });

  test("handles undefined bounds gracefully", () => {
    expect(shouldFire({}, 0.5)).toBeNull();
    expect(shouldFire({ takeProfit: 0.9 }, 0.3)).toBeNull();
    expect(shouldFire({ stopLoss: 0.1 }, 0.3)).toBeNull();
  });
});

describe("tpsl.buildSellOrder", () => {
  test("returns market sell for full position", () => {
    const rule: TpSlRule = { takeProfit: 0.8 };
    const pos = { tokenId: "tok123", shares: 100, currentPrice: 0.85 };
    const order = buildSellOrder(rule, pos, "tp");
    expect(order.side).toBe("SELL");
    expect(order.type).toBe("MARKET");
    expect(order.size).toBe(100);
    expect(order.tokenId).toBe("tok123");
  });
});
