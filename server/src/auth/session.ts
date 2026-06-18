import { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { env } from "../env";

const ALLOWLIST = new Set(["/healthz", "/unlock", "/session"]);

export function cookieMatches(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const a = Buffer.from(value);
    const b = Buffer.from(env.SESSION_SECRET);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Apply at root scope. Registering as a plugin would encapsulate the
// hook to its own context and it would never fire for sibling routes.
export function applySessionGate(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (ALLOWLIST.has(path)) return;
    if (!cookieMatches(request.cookies["fifa_session"])) {
      return reply.send(app.httpErrors.unauthorized("locked"));
    }
  });
}
