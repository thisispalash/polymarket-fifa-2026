/**
 * Scale-out / partial TP pure logic — no I/O.
 *
 * Each tick: check which legs have not yet been consumed and whose
 * atPrice threshold has been reached. Returns firing legs + updated rule
 * with consumed flags set.
 */
import type { ScaleOutRule, ScaleOutLeg } from "@fifa/shared";

export interface FiringLeg {
  index: number;
  pct: number;
  size: number;
}

export function checkLegs(
  rule: ScaleOutRule,
  mark: number,
  positionShares: number,
): { firingLegs: FiringLeg[]; updatedRule: ScaleOutRule } {
  const firingLegs: FiringLeg[] = [];
  const updatedLegs: ScaleOutLeg[] = rule.legs.map((leg, index) => {
    if (leg.consumed) return leg;
    if (mark >= leg.atPrice) {
      firingLegs.push({
        index,
        pct: leg.pct,
        size: positionShares * (leg.pct / 100),
      });
      return { ...leg, consumed: true };
    }
    return leg;
  });

  return {
    firingLegs,
    updatedRule: { ...rule, legs: updatedLegs },
  };
}
