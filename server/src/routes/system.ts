import { FastifyInstance } from "fastify";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { cookieMatches } from "../auth/session";

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
}
