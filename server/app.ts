import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";

import { bggRoutes } from "./bgg/routes";
import { csrf, requireAdmin, requireApproved, session } from "./middleware";
import { dataRoutes } from "./routes/data";
import { importRoutes } from "./routes/import";
import { linkRoutes } from "./routes/links";
import { memberOverrideRoutes } from "./routes/memberOverrides";
import { playedRoutes } from "./routes/played";
import { profileRoutes } from "./routes/profile";
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

const MAX_BODY_BYTES = 256 * 1024;
/** The admin import route enforces its own, larger limit. */
const IMPORT_PATH = "/api/admin/import";

const smallBodies = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => c.json({ error: "payload_too_large" }, 413),
});

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use(
    secureHeaders({
      xFrameOptions: "DENY",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "strict-origin-when-cross-origin",
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
      permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    }),
  );
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });
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
  app.use("/api/*", (c, next) =>
    c.req.method === "POST" && c.req.path === IMPORT_PATH
      ? next()
      : smallBodies(c, next),
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
    const { discordId, name, displayName, discordName, image, role, status } =
      user;
    return status === "approved"
      ? c.json({
          status,
          user: { discordId, name, displayName, discordName, image, role },
        })
      : c.json({
          status,
          user: { discordId, name: discordName, image },
        });
  });
  api.use("/admin/*", requireAdmin);
  api.route("/admin", adminRoutes(deps.store));
  if (deps.bgg) api.route("/admin/bgg", bggRoutes(deps.bgg));
  api.route("/admin", importRoutes(deps.data));
  api.route("/admin", linkRoutes(deps.links));
  api.route("/", profileRoutes(deps.profiles));
  api.route("/", playedRoutes(deps.played));
  api.route("/", memberOverrideRoutes(deps.memberOverrides));
  api.route("/", dataRoutes(deps.data));
  api.all("*", (c) => c.json({ error: "not_found" }, 404));
  app.route("/api", api);

  return app;
}
