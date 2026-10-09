import { createMiddleware } from "hono/factory";

import type { AppDeps, AppEnv } from "./types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Rejects cross-site state-changing requests. Browsers always send
 * Sec-Fetch-Site; Origin is the fallback for older clients. The SPA on a
 * sibling subdomain is same-site, so it is accepted only when its Origin is
 * the configured web origin.
 */
export const csrf = (baseUrl: string, webOrigin?: string) => {
  const allowedOrigins = [new URL(baseUrl).origin, webOrigin];
  return createMiddleware<AppEnv>(async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    const site = c.req.header("sec-fetch-site");
    const origin = c.req.header("origin");
    const originOk = origin !== undefined && allowedOrigins.includes(origin);
    const allowed = site
      ? site === "same-origin" ||
        site === "none" ||
        (site === "same-site" && originOk)
      : originOk;
    if (!allowed) return c.json({ error: "forbidden_origin" }, 403);
    return next();
  });
};

export const session = (resolveSession: AppDeps["resolveSession"]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const { user, headers } = await resolveSession(c.req.raw.headers);
    c.set("user", user);
    await next();
    // Forward refreshed session cookies (Better Auth extends sessions on use).
    for (const cookie of headers?.getSetCookie() ?? []) {
      c.res.headers.append("set-cookie", cookie);
    }
  });

export const requireApproved = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  if (user.status !== "approved") return c.json({ error: "forbidden" }, 403);
  return next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  if (user.status !== "approved" || user.role !== "admin")
    return c.json({ error: "forbidden" }, 403);
  return next();
});
