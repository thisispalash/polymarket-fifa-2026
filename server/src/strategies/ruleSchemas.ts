import { z } from "zod";
import { logger } from "../logger";

// Single source of truth for the jsonb shapes stored in
// fifa.strategy_rules.rule. Both the POST /strategies/:id/rules route
// (write side) and every worker (read side) parse against the same
// schema, so corrupt jsonb is caught at the seam instead of crashing
// the workers mid-trade with a casted-undefined deref.

export const tpSlRuleSchema = z.object({
  tokenId: z.string().min(1),
  takeProfit: z.number().min(0).max(1).optional(),
  stopLoss: z.number().min(0).max(1).optional(),
  slippageBps: z.number().int().min(0).optional(),
});

export const trailingStopRuleSchema = z.object({
  tokenId: z.string().min(1),
  trailPct: z.number().positive(),
  highWaterMark: z.number().optional(),
  triggerPrice: z.number().optional(),
});

export const scaleOutRuleSchema = z.object({
  tokenId: z.string().min(1),
  legs: z.array(z.object({
    pct: z.number().positive(),
    atPrice: z.number().positive(),
    consumed: z.boolean().default(false),
  })).min(1),
});

export const limitLadderRuleSchema = z.object({
  marketId: z.string().min(1),
  tokenId: z.string().min(1),
  rungs: z.array(z.object({
    price: z.number().positive(),
    size: z.number().positive(),
    side: z.enum(["BUY", "SELL"]),
    orderId: z.string().optional(),
    filled: z.boolean().optional(),
  })).min(1),
  topUp: z.boolean(),
  maxActive: z.number().int().positive(),
});

// dutch_arb / yesno_arb are config-driven strategies — they do not
// consume per-rule rows. .strict() rejects ad-hoc jsonb writes so a
// future stray POST can't silently store an unbounded blob.
export const arbRuleSchema = z.object({}).strict();

export const ruleSchemaByKind = {
  tp_sl: tpSlRuleSchema,
  trailing_stop: trailingStopRuleSchema,
  scale_out: scaleOutRuleSchema,
  limit_ladder: limitLadderRuleSchema,
  dutch_arb: arbRuleSchema,
  yesno_arb: arbRuleSchema,
} as const;

export type RuleKind = keyof typeof ruleSchemaByKind;

// Worker-side parser. Returns null and logs once if a stored rule no
// longer matches its schema (operator hand-edit, schema drift, etc.).
// The caller skips the row instead of crashing the worker tick.
export function parseRule<K extends RuleKind>(
  kind: K,
  raw: unknown,
  ruleId?: number,
): z.infer<typeof ruleSchemaByKind[K]> | null {
  const schema = ruleSchemaByKind[kind];
  const result = schema.safeParse(raw);
  if (!result.success) {
    logger.warn(
      { kind, ruleId, errors: result.error.flatten() },
      "ruleSchemas: stored rule failed validation, skipping",
    );
    return null;
  }
  return result.data as z.infer<typeof ruleSchemaByKind[K]>;
}
