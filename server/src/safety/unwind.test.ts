import { test, expect, mock } from "bun:test";

const cancelCalls: string[] = [];
let cancelImpl: (orderId: string) => Promise<unknown> = async (id) => ({ orderId: id });

mock.module("../polymarket/client", () => ({
  getSecureClient: async () => ({
    cancelOrder: async ({ orderId }: { orderId: string }) => {
      cancelCalls.push(orderId);
      return cancelImpl(orderId);
    },
  }),
}));

mock.module("../logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

const { cancelLegsBestEffort } = await import("./unwind");

test("empty orderIds → no cancels, no failures", async () => {
  cancelCalls.length = 0;
  cancelImpl = async (id) => ({ orderId: id });
  const result = await cancelLegsBestEffort([], { source: "test" });
  expect(result).toEqual({ cancelled: 0, failedIds: [] });
  expect(cancelCalls).toEqual([]);
});

test("all cancels succeed → cancelled = n, failedIds empty", async () => {
  cancelCalls.length = 0;
  cancelImpl = async (id) => ({ orderId: id });
  const result = await cancelLegsBestEffort(["a", "b", "c"], { source: "test" });
  expect(result.cancelled).toBe(3);
  expect(result.failedIds).toEqual([]);
  expect(cancelCalls.sort()).toEqual(["a", "b", "c"]);
});

test("partial cancel failure → failedIds names the broken ones", async () => {
  cancelCalls.length = 0;
  cancelImpl = async (id) => {
    if (id === "b") throw new Error("sdk error");
    return { orderId: id };
  };
  const result = await cancelLegsBestEffort(["a", "b", "c"], { source: "test" });
  expect(result.cancelled).toBe(2);
  expect(result.failedIds).toEqual(["b"]);
});

test("all cancels fail → cancelled = 0, failedIds = all", async () => {
  cancelCalls.length = 0;
  cancelImpl = async () => {
    throw new Error("sdk down");
  };
  const result = await cancelLegsBestEffort(["a", "b"], { source: "test" });
  expect(result.cancelled).toBe(0);
  expect(result.failedIds.sort()).toEqual(["a", "b"]);
});
