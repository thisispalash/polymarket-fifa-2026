/**
 * Dutch arbitrage pure math — no I/O.
 *
 * A Dutch (multi-outcome) arb exists when sum(best_ask_i) < 1.0 - margin.
 * Equal-profit allocation: buy K/price_i shares of each outcome where
 * K = budget / sum(1/price_i). All outcomes pay exactly K on win.
 */

export function detect(
  prices: number[],
  margin: number,
): { edgePct: number; sumPrice: number } | null {
  if (prices.length < 2) return null;

  let sumPrice = 0;
  for (const p of prices) sumPrice += p;

  if (sumPrice >= 1 - margin) return null;

  return {
    edgePct: (1 - sumPrice) * 100,
    sumPrice,
  };
}

export function computeStakes(
  prices: number[],
  budget: number,
): { stakes: number[]; profit: number } | null {
  if (prices.length < 2) return null;

  let sumPrice = 0;
  for (const p of prices) sumPrice += p;

  // No arb if sum >= 1.0
  if (sumPrice >= 1.0) return null;

  // Equal-profit allocation: each outcome pays K = budget / sum(p_i) shares.
  // Cost of leg i = K * p_i (stakes_i), total cost = K * sum(p_i) = budget.
  const K = budget / sumPrice;
  const stakes = prices.map((p) => K * p);
  const profit = K - budget; // K > budget because sumPrice < 1.0 → 1/sumPrice > 1

  return { stakes, profit };
}
