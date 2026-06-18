import Fastify from "fastify";
import cookie from "@fastify/cookie";
import sensible from "@fastify/sensible";
import { env } from "./env";
import { loggerOptions } from "./logger";
import { verifyDb } from "./db/push";

const app = Fastify({
  logger: loggerOptions,
});

await app.register(cookie);
await app.register(sensible);

app.get("/healthz", async () => {
  const result = await verifyDb();
  if (!result.ok) {
    throw app.httpErrors.serviceUnavailable(result.error ?? "Database unreachable");
  }
  return { ok: true, db: "reachable" };
});

try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
  app.log.info(`Server listening on 0.0.0.0:${env.PORT}`);
} catch (error) {
  app.log.error(error, "Failed to start server");
  process.exit(1);
}
