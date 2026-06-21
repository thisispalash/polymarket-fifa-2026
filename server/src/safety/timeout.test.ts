import { test, expect } from "bun:test";
import { withTimeout, SdkTimeoutError } from "./timeout";

test("withTimeout: resolves before deadline returns the value", async () => {
  const fast = new Promise<number>((res) => setTimeout(() => res(42), 5));
  expect(await withTimeout(fast, 50, "fast")).toBe(42);
});

test("withTimeout: hangs past deadline rejects with SdkTimeoutError naming the label", async () => {
  const slow = new Promise<number>((res) => setTimeout(() => res(99), 200));
  let caught: unknown = null;
  try {
    await withTimeout(slow, 10, "slow-fetch");
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(SdkTimeoutError);
  expect((caught as Error).message).toContain("slow-fetch");
  expect((caught as Error).message).toContain("10ms");
});

test("withTimeout: rejected promise propagates its own error, not a timeout", async () => {
  const failing = Promise.reject(new Error("upstream 503"));
  let caught: unknown = null;
  try {
    await withTimeout(failing, 50, "failing");
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toBe("upstream 503");
  expect(caught).not.toBeInstanceOf(SdkTimeoutError);
});
