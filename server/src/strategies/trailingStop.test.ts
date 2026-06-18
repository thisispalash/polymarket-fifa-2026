import { describe, test, expect } from "bun:test";
import { tick } from "./trailingStop";

describe("trailingStop.tick", () => {
  test("ratchets hwm and triggerPrice up when mark rises", () => {
    const rule = { trailPct: 10, highWaterMark: 0.5, triggerPrice: 0.45 };
    const { updatedRule, fire } = tick(rule, 0.6);
    expect(updatedRule.highWaterMark).toBe(0.6);
    expect(updatedRule.triggerPrice).toBeCloseTo(0.54);
    expect(fire).toBe(false);
  });

  test("fires when mark falls to or below triggerPrice", () => {
    const rule = { trailPct: 10, highWaterMark: 0.6, triggerPrice: 0.54 };
    const { fire } = tick(rule, 0.54);
    expect(fire).toBe(true);
  });

  test("no fire when mark stays above triggerPrice", () => {
    const rule = { trailPct: 10, highWaterMark: 0.6, triggerPrice: 0.54 };
    const { fire, updatedRule } = tick(rule, 0.57);
    expect(fire).toBe(false);
    expect(updatedRule.highWaterMark).toBe(0.6); // unchanged
  });

  test("initialises hwm and triggerPrice from mark when undefined", () => {
    const rule = { trailPct: 5 };
    const { updatedRule, fire } = tick(rule, 0.8);
    expect(updatedRule.highWaterMark).toBe(0.8);
    expect(updatedRule.triggerPrice).toBeCloseTo(0.76);
    expect(fire).toBe(false);
  });
});
