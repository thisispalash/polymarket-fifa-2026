import { FastifyInstance } from "fastify";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { db } from "../db/client";
import { killSwitchState, strategyConfigs } from "../db/schema";
import { setKillSwitch } from "../safety/killSwitch";
import { getSecureClient } from "../polymarket/client";
import { env } from "../env";
import { cookieMatches } from "../auth/session";
import { logger } from "../logger";

const unlockBody = z.object({ secret: z.string() });

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.post("/unlock", async (request, reply) => {
    const parsed = unlockBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.send(app.httpErrors.badRequest("secret required"));
    }
    const a = Buffer.from(parsed.data.secret);
    const b = Buffer.from(env.SESSION_SECRET);
    const match = a.length === b.length && timingSafeEqual(a, b);
    if (!match) {
      return reply.send(app.httpErrors.unauthorized("invalid secret"));
    }
    reply.setCookie("fifa_session", env.SESSION_SECRET, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return { unlocked: true };
  });

  app.get("/session", async (request) => {
    return { unlocked: cookieMatches(request.cookies["fifa_session"]) };
  });

  // GET /kill-switch — current state
  app.get("/kill-switch", async (_request, _reply) => {
    const rows = await db.select().from(killSwitchState).limit(1);
    if (rows.length === 0) {
      return { enabled: false, reason: null, triggeredAt: null, updatedAt: new Date().toISOString() };
    }
    const row = rows[0]!;
    return {
      enabled: row.enabled,
      reason: row.reason ?? null,
      triggeredAt: row.triggeredAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  const killSwitchBody = z.object({ reason: z.string().optional() });

  // POST /kill-switch — cancel all orders, set flag, disable all strategies
  app.post("/kill-switch", async (request, reply) => {
    const parsed = killSwitchBody.safeParse(request.body);
    if (!parsed.success) return reply.send(app.httpErrors.badRequest(parsed.error.message));

    const { reason } = parsed.data;

    // 1. Cancel all open orders via SDK — failure is logged but not fatal
    let cancelledCount: number | "unknown" = "unknown";
    try {
      const client = await getSecureClient();
      const result = await client.cancelAll();
      // CancelOrdersResponse may carry a cancelled list; use length if available
      const ids = (result as { canceled?: string[] }).canceled;
      cancelledCount = Array.isArray(ids) ? ids.length : "unknown";
      logger.info({ cancelledCount }, "kill-switch: cancelAll succeeded");
    } catch (err) {
      logger.error({ err }, "kill-switch: cancelAll failed, continuing");
    }

    // 2. Flip kill switch
    await setKillSwitch(true, reason);

    // 3. Disable every strategy config
    await db.update(strategyConfigs).set({ enabled: false, updatedAt: new Date() });

    logger.warn({ reason, cancelledCount }, "kill switch activated");
    return { killed: true, cancelledCount };
  });
}
