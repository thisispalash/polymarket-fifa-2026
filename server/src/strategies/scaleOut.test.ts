import { describe, test, expect } from "bun:test";
import { checkLegs } from "./scaleOut";
import type { ScaleOutRule } from "@fifa/shared";

const rule: ScaleOutRule = {
  legs: [
    { pct: 25, atPrice: 0.4, consumed: false },
    { pct: 25, atPrice: 0.6, consumed: false },
    { pct: 50, atPrice: 0.8, consumed: false },
  ],
};

describe("scaleOut.checkLegs", () => {
  test("fires only legs whose threshold is crossed", () => {
    const { firingLegs, updatedRule } = checkLegs(rule, 0.5, 100);
    expect(firingLegs).toHaveLength(1);
    expect(firingLegs[0]?.index).toBe(0);
    expect(firingLegs[0]?.size).toBe(25);
    expect(updatedRule.legs[0]?.consumed).toBe(true);
    expect(updatedRule.legs[1]?.consumed).toBe(false);
  });

  test("subsequent tick at 0.65 fires leg 1, leg 0 stays consumed", () => {
    const partlyConsumed: ScaleOutRule = {
      legs: [
        { pct: 25, atPrice: 0.4, consumed: true },
        { pct: 25, atPrice: 0.6, consumed: false },
        { pct: 50, atPrice: 0.8, consumed: false },
      ],
    };
    const { firingLegs, updatedRule } = checkLegs(partlyConsumed, 0.65, 100);
    expect(firingLegs).toHaveLength(1);
    expect(firingLegs[0]?.index).toBe(1);
    expect(updatedRule.legs[0]?.consumed).toBe(true); // still consumed
    expect(updatedRule.legs[1]?.consumed).toBe(true);
  });

  test("no firing when mark is below all thresholds", () => {
    const { firingLegs } = checkLegs(rule, 0.3, 100);
    expect(firingLegs).toHaveLength(0);
  });

  test("fires all legs at once when mark crosses all thresholds", () => {
    const { firingLegs, updatedRule } = checkLegs(rule, 0.9, 200);
    expect(firingLegs).toHaveLength(3);
    expect(firingLegs[0]?.size).toBe(50);  // 25% of 200
    expect(firingLegs[1]?.size).toBe(50);  // 25% of 200
    expect(firingLegs[2]?.size).toBe(100); // 50% of 200
    expect(updatedRule.legs.every((l) => l.consumed)).toBe(true);
  });
});
