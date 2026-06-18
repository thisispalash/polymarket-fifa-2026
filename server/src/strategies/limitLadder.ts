/**
 * Limit-order ladder pure helpers — no I/O.
 */
import type { LimitLadderRule, LimitLadderRung } from "@fifa/shared";

/** Rungs that need a new order placed (no orderId, not filled). */
export function rungsNeedingPlacement(rule: LimitLadderRule): Array<{ index: number; rung: LimitLadderRung }> {
  return rule.rungs
    .map((rung, index) => ({ index, rung }))
    .filter(({ rung }) => !rung.orderId && !rung.filled);
}

/** Rungs eligible for top-up: have been filled and topUp is enabled. */
export function rungsNeedingTopUp(rule: LimitLadderRule): Array<{ index: number; rung: LimitLadderRung }> {
  if (!rule.topUp) return [];
  return rule.rungs
    .map((rung, index) => ({ index, rung }))
    .filter(({ rung }) => rung.filled === true && !rung.orderId);
}

/** Count of rungs with an active (non-filled) order. */
export function activeRungCount(rule: LimitLadderRule): number {
  return rule.rungs.filter((r) => r.orderId && !r.filled).length;
}

/** Return a copy of rule with orderId set on the given rung index. */
export function withOrderId(rule: LimitLadderRule, index: number, orderId: string): LimitLadderRule {
  return {
    ...rule,
    rungs: rule.rungs.map((r, i) => (i === index ? { ...r, orderId, filled: false } : r)),
  };
}

/** Return a copy of rule with a rung marked filled and orderId cleared (ready for top-up). */
export function withFilled(rule: LimitLadderRule, index: number): LimitLadderRule {
  return {
    ...rule,
    rungs: rule.rungs.map((r, i) => (i === index ? { ...r, filled: true, orderId: undefined } : r)),
  };
}
