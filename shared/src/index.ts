export type Side = "YES" | "NO";

export type OutcomeToken = {
  tokenId: string;
  outcome: string;
  price: number;
};

export type Market = {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  description?: string;
  category?: string;
  endDateIso?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  volume?: number;
  liquidity?: number;
  outcomes: OutcomeToken[];
};

export type Position = {
  marketId: string;
  conditionId: string;
  tokenId: string;
  outcome: string;
  side: Side;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  costBasis: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  question: string;
};

export type Balances = {
  usdc: number;
  totalCostBasis: number;
  totalCurrentValue: number;
  totalUnrealizedPnl: number;
};

export type OrderType = "MARKET" | "LIMIT";

export type SubmitOrderInput = {
  tokenId: string;
  side: "BUY" | "SELL";
  type: OrderType;
  price?: number;
  size: number;
  strategyId?: number;
};

export type StrategyKind =
  | "dutch_arb"
  | "yesno_arb"
  | "tp_sl"
  | "trailing_stop"
  | "scale_out"
  | "limit_ladder";

export const STRATEGY_KINDS: readonly StrategyKind[] = [
  "dutch_arb",
  "yesno_arb",
  "tp_sl",
  "trailing_stop",
  "scale_out",
  "limit_ladder",
] as const;

export const STRATEGY_LABELS: Record<StrategyKind, string> = {
  dutch_arb: "Dutch arbitrage",
  yesno_arb: "YES/NO arbitrage",
  tp_sl: "Take-profit / Stop-loss",
  trailing_stop: "Trailing stop",
  scale_out: "Scale-out / partial TP",
  limit_ladder: "Limit-order ladders",
};

export type StrategyConfig = {
  id: number;
  kind: StrategyKind;
  enabled: boolean;
  capitalCap: number;
  autoExecute: boolean;
  params: Record<string, unknown>;
  realizedPnl: number;
};

export type TpSlRule = {
  takeProfit?: number;
  stopLoss?: number;
  slippageBps?: number;
};

export type TrailingStopRule = {
  trailPct: number;
  highWaterMark?: number;
  triggerPrice?: number;
};

export type ScaleOutLeg = {
  pct: number;
  atPrice: number;
  consumed: boolean;
};
export type ScaleOutRule = {
  legs: ScaleOutLeg[];
};

export type LimitLadderRung = {
  price: number;
  size: number;
  side: "BUY" | "SELL";
  orderId?: string;
  filled?: boolean;
};
export type LimitLadderRule = {
  marketId: string;
  tokenId: string;
  rungs: LimitLadderRung[];
  topUp: boolean;
  maxActive: number;
};

export type ArbOpportunity = {
  id: number;
  kind: "dutch_arb" | "yesno_arb";
  marketId: string;
  question: string;
  sumPrice: number;
  edgePct: number;
  stakes: { tokenId: string; outcome: string; price: number; shares: number; cost: number }[];
  estimatedProfit: number;
  detectedAt: string;
  executed: boolean;
};
