import {
  pgSchema,
  serial,
  text,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const fifa = pgSchema("fifa");

export const clobCredentials = fifa.table("clob_credentials", {
  id: serial("id").primaryKey(),
  apiKey: text("api_key").notNull(),
  apiSecret: text("api_secret").notNull(),
  passphrase: text("passphrase").notNull(),
  proxyWallet: text("proxy_wallet"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const watchlist = fifa.table(
  "watchlist",
  {
    id: serial("id").primaryKey(),
    marketId: text("market_id").notNull(),
    conditionId: text("condition_id").notNull(),
    slug: text("slug").notNull(),
    question: text("question").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    marketUnique: uniqueIndex("watchlist_market_unique").on(t.marketId),
  })
);

export const positionsCache = fifa.table(
  "positions_cache",
  {
    id: serial("id").primaryKey(),
    tokenId: text("token_id").notNull(),
    marketId: text("market_id").notNull(),
    conditionId: text("condition_id").notNull(),
    outcome: text("outcome").notNull(),
    shares: doublePrecision("shares").notNull(),
    avgPrice: doublePrecision("avg_price").notNull(),
    currentPrice: doublePrecision("current_price").notNull(),
    question: text("question").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenUnique: uniqueIndex("positions_cache_token_unique").on(t.tokenId),
  })
);

export const balancesCache = fifa.table("balances_cache", {
  id: serial("id").primaryKey(),
  usdc: doublePrecision("usdc").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const priceHistory = fifa.table(
  "price_history",
  {
    id: serial("id").primaryKey(),
    tokenId: text("token_id").notNull(),
    price: doublePrecision("price").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byToken: index("price_history_token_idx").on(t.tokenId, t.recordedAt),
  })
);

export const strategyConfigs = fifa.table(
  "strategy_configs",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    autoExecute: boolean("auto_execute").default(false).notNull(),
    capitalCap: doublePrecision("capital_cap").default(0).notNull(),
    realizedPnl: doublePrecision("realized_pnl").default(0).notNull(),
    params: jsonb("params").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    kindUnique: uniqueIndex("strategy_configs_kind_unique").on(t.kind),
  })
);

export const strategyRules = fifa.table(
  "strategy_rules",
  {
    id: serial("id").primaryKey(),
    strategyId: integer("strategy_id")
      .notNull()
      .references(() => strategyConfigs.id, { onDelete: "cascade" }),
    marketId: text("market_id"),
    tokenId: text("token_id"),
    rule: jsonb("rule").$type<Record<string, unknown>>().notNull(),
    status: text("status").default("active").notNull(),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byStrategy: index("strategy_rules_strategy_idx").on(t.strategyId),
    byToken: index("strategy_rules_token_idx").on(t.tokenId),
  })
);

export const strategyExecutions = fifa.table(
  "strategy_executions",
  {
    id: serial("id").primaryKey(),
    strategyId: integer("strategy_id")
      .notNull()
      .references(() => strategyConfigs.id, { onDelete: "cascade" }),
    ruleId: integer("rule_id").references(() => strategyRules.id, {
      onDelete: "set null",
    }),
    marketId: text("market_id"),
    tokenId: text("token_id"),
    side: text("side"),
    price: doublePrecision("price"),
    size: doublePrecision("size"),
    orderId: text("order_id"),
    pnl: doublePrecision("pnl").default(0).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byStrategy: index("strategy_executions_strategy_idx").on(t.strategyId),
    // Composite for the cap-window SUM in caps.ts — filters by strategyId
    // AND createdAt > windowStart on every submitOrder. Single-column
    // strategyId index forces a scan of all rows for that strategy.
    byStrategyTime: index("strategy_executions_strategy_time_idx").on(
      t.strategyId,
      t.createdAt,
    ),
  })
);

export const arbOpportunities = fifa.table(
  "arb_opportunities",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    marketId: text("market_id").notNull(),
    conditionId: text("condition_id").notNull(),
    question: text("question").notNull(),
    sumPrice: doublePrecision("sum_price").notNull(),
    edgePct: doublePrecision("edge_pct").notNull(),
    stakes: jsonb("stakes").notNull(),
    estimatedProfit: doublePrecision("estimated_profit").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
    executed: boolean("executed").default(false).notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (t) => ({
    byMarket: index("arb_market_idx").on(t.marketId),
    byDetected: index("arb_detected_idx").on(t.detectedAt),
  })
);

export const killSwitchState = fifa.table("kill_switch_state", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  reason: text("reason"),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = fifa.table(
  "sessions",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
  })
);

export const orderLog = fifa.table(
  "order_log",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id"),
    tokenId: text("token_id").notNull(),
    side: text("side").notNull(),
    type: text("type").notNull(),
    price: doublePrecision("price"),
    size: doublePrecision("size").notNull(),
    strategyId: integer("strategy_id"),
    // Optional client-supplied idempotency key. Indexed UNIQUE WHERE NOT
    // NULL (created in the migration script) so retries collapse to one
    // order without forcing every internal order path to carry a key.
    clientOrderId: text("client_order_id"),
    status: text("status").default("submitted").notNull(),
    requestPayload: jsonb("request_payload"),
    responsePayload: jsonb("response_payload"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byOrderId: index("order_log_order_id_idx").on(t.orderId),
    byToken: index("order_log_token_idx").on(t.tokenId),
    // Cap-window inflight query: WHERE strategy_id = $1 AND status IN (...)
    byStrategyStatus: index("order_log_strategy_status_idx").on(
      t.strategyId,
      t.status,
    ),
  })
);
