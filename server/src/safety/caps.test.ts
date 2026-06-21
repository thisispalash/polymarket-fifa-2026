import { test, expect, mock } from "bun:test";

// Stub DB-dependent modules before importing caps so env validation is skipped.
mock.module("../db/client", () => ({ db: {} }));
mock.module("../db/schema", () => ({
  strategyConfigs: {},
  strategyExecutions: {},
  orderLog: {},
}));

const { wouldBreachCap, computeOrderCostUsdc } = await import("./caps");

test("cap=100, sumSpent=50, cost=49 → false (under cap)", () => {
  expect(wouldBreachCap(50, 100, 49)).toBe(false);
});

test("computeOrderCostUsdc: LIMIT BUY → size × price", () => {
  expect(computeOrderCostUsdc({ tokenId: "t", side: "BUY", type: "LIMIT", size: 100, price: 0.42 })).toBe(42);
});

test("computeOrderCostUsdc: LIMIT SELL → size × price", () => {
  expect(computeOrderCostUsdc({ tokenId: "t", side: "SELL", type: "LIMIT", size: 100, price: 0.42 })).toBe(42);
});

test("computeOrderCostUsdc: MARKET BUY → size (size is USDC amount; price ignored)", () => {
  // Regression for P0 #2 — was returning 0 because input.price was undefined.
  expect(computeOrderCostUsdc({ tokenId: "t", side: "BUY", type: "MARKET", size: 500 })).toBe(500);
});

test("computeOrderCostUsdc: MARKET SELL → 0 (no price, sell recoups capital)", () => {
  expect(computeOrderCostUsdc({ tokenId: "t", side: "SELL", type: "MARKET", size: 100 })).toBe(0);
});

test("computeOrderCostUsdc: MARKET BUY with stray price field → still size (USDC amount wins)", () => {
  expect(computeOrderCostUsdc({ tokenId: "t", side: "BUY", type: "MARKET", size: 500, price: 0.9 })).toBe(500);
});

test("cap=100, sumSpent=50, cost=50 → false (exactly at cap, allowed)", () => {
  expect(wouldBreachCap(50, 100, 50)).toBe(false);
});

test("cap=100, sumSpent=50, cost=51 → true (one over cap)", () => {
  expect(wouldBreachCap(50, 100, 51)).toBe(true);
});

test("cap=100, sumSpent=100, cost=0.01 → true (already at cap, any addition breaches)", () => {
  expect(wouldBreachCap(100, 100, 0.01)).toBe(true);
});

test("cap=100, sumSpent=100, cost=0 → false (zero cost never breaches)", () => {
  expect(wouldBreachCap(100, 100, 0)).toBe(false);
});
