/**
 * Take-profit / Stop-loss pure logic — no I/O.
 */
import type { TpSlRule, SubmitOrderInput } from "@fifa/shared";

export function shouldFire(
  rule: TpSlRule,
  mark: number,
): "tp" | "sl" | null {
  if (rule.takeProfit !== undefined && mark >= rule.takeProfit) return "tp";
  if (rule.stopLoss !== undefined && mark <= rule.stopLoss) return "sl";
  return null;
}

export function buildSellOrder(
  rule: TpSlRule,
  position: { tokenId: string; shares: number; currentPrice: number },
  _trigger: "tp" | "sl",
): SubmitOrderInput {
  return {
    tokenId: position.tokenId,
    side: "SELL",
    type: "MARKET",
    size: position.shares,
  };
}
