import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 0x-prefixed 32-byte hex private key"),
  CLOB_HOST: z.string().url().default("https://clob.polymarket.com"),
  GAMMA_HOST: z.string().url().default("https://gamma-api.polymarket.com"),

  DATABASE_URL: z.string().url(),

  SESSION_SECRET: z.string().min(16, "Use at least 16 chars"),

  MAX_AUTO_STAKE: z.coerce.number().default(50),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
