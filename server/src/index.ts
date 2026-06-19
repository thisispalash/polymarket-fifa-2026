import Fastify from "fastify";
import cookie from "@fastify/cookie";
import sensible from "@fastify/sensible";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { env } from "./env";
import { loggerOptions } from "./logger";
import { verifyDb } from "./db/push";
import { applySessionGate } from "./auth/session";
import { systemRoutes } from "./routes/system";
import { marketsRoutes } from "./routes/markets";
import { watchlistRoutes } from "./routes/watchlist";
import { portfolioRoutes } from "./routes/portfolio";
import { ordersRoutes } from "./routes/orders";
import { strategiesRoutes } from "./routes/strategies";
import { rulesRoutes } from "./routes/rules";
import { arbsRoutes } from "./routes/arbs";
import { startWorkers, getWorkerHealth } from "./workers/runner";
import { portfolioSyncWorker } from "./workers/portfolioSync";
import { orderReconcileWorker } from "./workers/orderReconcile";
import { arbScanWorker } from "./workers/arbScan";
import { tpslCheckWorker } from "./workers/tpslCheck";
import { ladderManageWorker } from "./workers/ladderManage";

const app = Fastify({
  logger: loggerOptions,
});

await app.register(cookie);
await app.register(sensible);
applySessionGate(app);
await app.register(async (api) => {
  api.get("/healthz", async () => {
    const result = await verifyDb();
    if (!result.ok) {
      throw api.httpErrors.serviceUnavailable(result.error ?? "Database unreachable");
    }
    return { ok: true, db: "reachable", workers: getWorkerHealth() };
  });
  await api.register(systemRoutes);
  await api.register(marketsRoutes);
  await api.register(watchlistRoutes);
  await api.register(portfolioRoutes);
  await api.register(ordersRoutes);
  await api.register(strategiesRoutes);
  await api.register(rulesRoutes);
  await api.register(arbsRoutes);
}, { prefix: "/api" });

// In production, serve the built PWA from web/dist. The session gate
// allowlists /healthz, /unlock, /session — every other API path is
// gated. Static assets must not collide with API routes; they don't,
// since the SPA lives at /, /assets/*, /icons/*, etc.
if (env.NODE_ENV === "production") {
  await app.register(fastifyStatic, {
    root: resolve(import.meta.dir, "../../web/dist"),
    prefix: "/",
    wildcard: false,
  });
  // SPA fallback: send any unmatched GET to index.html so React Router can route it.
  app.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api")) {
      return reply.sendFile("index.html");
    }
    return reply.status(404).send({ error: "not found" });
  });
}

try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
  app.log.info(`Server listening on 0.0.0.0:${env.PORT}`);
  startWorkers([portfolioSyncWorker, orderReconcileWorker, arbScanWorker, tpslCheckWorker, ladderManageWorker]);
} catch (error) {
  app.log.error(error, "Failed to start server");
  process.exit(1);
}
