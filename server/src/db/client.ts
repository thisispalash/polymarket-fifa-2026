import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  prepare: false,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
