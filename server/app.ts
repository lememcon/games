import { Hono } from "hono";
import { compress } from "hono/compress";

import { csrf, requireAdmin, session } from "./middleware";
import { mountStatic } from "./static";
import type { AppDeps, AppEnv } from "./types";

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use(compress());
  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.use("/api/*", csrf(deps.baseUrl));
  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.authHandler(c.req.raw));
  app.use("/api/*", session(deps.resolveSession));

  app.get("/api/me", (c) => {
    const user = c.get("user");
    return c.json({ role: user?.role ?? "anonymous", user });
  });
  app.get("/api/admin/ping", requireAdmin, (c) => c.json({ pong: true }));
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  mountStatic(app, deps.staticDir);

  return app;
}
