/**
 * Trailing stop pure logic — no I/O.
 *
 * Each tick: if mark > highWaterMark, ratchet up (update hwm + triggerPrice).
 * If mark <= triggerPrice, fire = true.
 */
import type { TrailingStopRule } from "@fifa/shared";

export function tick(
  rule: TrailingStopRule,
  mark: number,
): { updatedRule: TrailingStopRule; fire: boolean } {
  const hwm = rule.highWaterMark ?? mark;
  const trail = rule.trailPct / 100;
  let newHwm = hwm;
  let triggerPrice = rule.triggerPrice ?? hwm * (1 - trail);

  if (mark > hwm) {
    newHwm = mark;
    triggerPrice = mark * (1 - trail);
  }

  const fire = mark <= triggerPrice;

  return {
    updatedRule: {
      ...rule,
      highWaterMark: newHwm,
      triggerPrice,
    },
    fire,
  };
}
