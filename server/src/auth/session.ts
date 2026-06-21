import { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { sessions } from "../db/schema";
import { logger } from "../logger";

export const COOKIE_NAME = "fifa_session";

const ALLOWLIST = new Set(["/api/healthz", "/api/unlock", "/api/session"]);

// Why hash: the cookie value is server-issued opaque random bytes, but
// hashing what we persist means a DB dump alone doesn't grant access —
// the attacker would also need a live cookie to forge the lookup.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// 32 random bytes → 256 bits of entropy → guessing is infeasible.
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(): Promise<string> {
  const token = generateSessionToken();
  await db.insert(sessions).values({ tokenHash: hashToken(token) });
  return token;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(cookieValue)))
    .limit(1);
  if (!row) return false;
  // Fire-and-forget touch so an idle session can be expired later by a
  // background sweep without blocking the request path on a DB write.
  // A failed touch shouldn't crash the process; log and move on.
  db.update(sessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(sessions.id, row.id))
    .catch((err) => logger.warn({ err }, "session: lastUsedAt touch failed"));
  return true;
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
    const valid = await isValidSession(request.cookies[COOKIE_NAME]);
    if (!valid) {
      return reply.send(app.httpErrors.unauthorized("locked"));
    }
  });
}
