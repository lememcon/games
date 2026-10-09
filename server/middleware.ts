import { createMiddleware } from "hono/factory";

import type { AppDeps, AppEnv } from "./types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Rejects cross-site state-changing requests. Browsers always send
 * Sec-Fetch-Site; Origin is the fallback for older clients.
 */
export const csrf = (baseUrl: string) => {
  const allowedOrigin = new URL(baseUrl).origin;
  return createMiddleware<AppEnv>(async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    const site = c.req.header("sec-fetch-site");
    const allowed = site
      ? site === "same-origin" || site === "none"
      : c.req.header("origin") === allowedOrigin;
    if (!allowed) return c.json({ error: "forbidden_origin" }, 403);
    return next();
  });
};

export const session = (resolveSession: AppDeps["resolveSession"]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("user", await resolveSession(c.req.raw.headers));
    return next();
  });

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) return c.json({ error: "unauthenticated" }, 401);
  return next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  if (user.role !== "admin") return c.json({ error: "forbidden" }, 403);
  return next();
});
