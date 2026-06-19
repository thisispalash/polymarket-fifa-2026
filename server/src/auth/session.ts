import { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { env } from "../env";

const ALLOWLIST = new Set(["/api/healthz", "/api/unlock", "/api/session"]);

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
//
// Scope: ONLY /api/* is gated. Static assets (/assets/*, /icons/*) and
// the SPA HTML fallback at any non-/api GET are public — without this,
// the unlock page itself can't load on a fresh visit because the user
// has no cookie yet.
export function applySessionGate(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (!path.startsWith("/api")) return;
    if (ALLOWLIST.has(path)) return;
    if (!cookieMatches(request.cookies["fifa_session"])) {
      return reply.send(app.httpErrors.unauthorized("locked"));
    }
  });
}
