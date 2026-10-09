import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";

import { bggRoutes } from "./bgg/routes";
import { csrf, requireAdmin, requireApproved, session } from "./middleware";
import { dataRoutes } from "./routes/data";
import { importRoutes } from "./routes/import";
import { mountStatic } from "./static";
import type { AppDeps, AppEnv } from "./types";
import { adminRoutes } from "./users";

/** Score data is public to read; everything else under /api needs an approved user. */
const isPublic = (path: string, method: string) =>
  path === "/api/me" ||
  path.startsWith("/api/auth/") ||
  (method === "GET" &&
    (path === "/api/years" ||
      path === "/api/games" ||
      /^\/api\/years\/[^/]+\/scores$/.test(path)));

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use(compress());
  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.use(
    "/api/*",
    cors({
      // Exact match on the one configured origin; anything else gets no CORS headers.
      origin: (origin) => (origin === deps.webOrigin ? origin : null),
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowHeaders: ["content-type"],
    }),
  );
  app.use("/api/*", csrf(deps.baseUrl, deps.webOrigin));
  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.authHandler(c.req.raw));

  const api = new Hono<AppEnv>();
  api.use("*", session(deps.resolveSession));
  api.use("*", (c, next) =>
    isPublic(c.req.path, c.req.method) ? next() : requireApproved(c, next),
  );
  api.get("/me", (c) => {
    const user = c.get("user");
    if (!user) return c.json({ status: "anonymous" });
    const { discordId, name, image, role, status } = user;
    return status === "approved"
      ? c.json({ status, user: { discordId, name, image, role } })
      : c.json({ status, user: { discordId, name, image } });
  });
  api.use("/admin/*", requireAdmin);
  api.route("/admin", adminRoutes(deps.store));
  if (deps.bgg) api.route("/admin/bgg", bggRoutes(deps.bgg));
  api.route("/admin", importRoutes(deps.data));
  api.route("/", dataRoutes(deps.data));
  api.all("*", (c) => c.json({ error: "not_found" }, 404));
  app.route("/api", api);

  mountStatic(app, deps.staticDir);

  return app;
}
