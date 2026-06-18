import { test, expect, mock } from "bun:test";

// Stub DB-dependent modules before importing caps so env validation is skipped.
mock.module("../db/client", () => ({ db: {} }));
mock.module("../db/schema", () => ({
  strategyConfigs: {},
  strategyExecutions: {},
}));

const { wouldBreachCap } = await import("./caps");

test("cap=100, sumSpent=50, cost=49 → false (under cap)", () => {
  expect(wouldBreachCap(50, 100, 49)).toBe(false);
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
