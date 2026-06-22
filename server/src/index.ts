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
import { startWorkers, stopWorkers, getWorkerHealth } from "./workers/runner";
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
  // The healthcheck's job is "is the container up and the DB reachable?",
  // NOT "is the schema fully bootstrapped?". A schema_missing state is a
  // valid bootstrap-pending state — the container is alive and the
  // operator just needs to run `bun run db:push`. Failing the healthcheck
  // there creates a chicken-and-egg with Railway's deploy gating.
  api.get("/healthz", async () => {
    const result = await verifyDb();
    if (result.status === "db_unreachable") {
      throw api.httpErrors.serviceUnavailable(result.error ?? "Database unreachable");
    }
    return {
      ok: true,
      db: result.status,
      tables: result.tables.length,
      hint: result.status === "schema_missing"
        ? "run `bun run db:push` from server/ to push the schema"
        : undefined,
      workers: getWorkerHealth(),
    };
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
  // sendFile can throw (build artifact missing, FS read fails). Without a
  // guard, Fastify renders a 500 with the absolute file path in the body.
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api")) {
      try {
        return await reply.sendFile("index.html");
      } catch (err) {
        app.log.error({ err, url: request.url }, "SPA fallback: index.html unreadable");
        return reply.status(503).send({ error: "PWA bundle unavailable; check server build" });
      }
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

// Railway sends SIGTERM ahead of each redeploy. Stop scheduling worker
// ticks first so nothing new fires mid-shutdown, then drain HTTP. The
// `shuttingDown` latch keeps a duplicate signal (Ctrl+C twice, runner
// re-sending) from racing the close path.
let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "shutdown: stopping workers");
  stopWorkers();
  try {
    await app.close();
    app.log.info("shutdown: fastify closed cleanly");
  } catch (err) {
    app.log.error({ err }, "shutdown: fastify close failed");
  }
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
