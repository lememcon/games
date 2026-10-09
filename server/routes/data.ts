import { Hono } from "hono";
import { etag } from "hono/etag";
import { createMiddleware } from "hono/factory";

import type { AppEnv, DataStore } from "../types";

/** Public reads: years, one year's scores, and all games. */
export function dataRoutes(data: DataStore) {
  const routes = new Hono<AppEnv>();

  // Per route, not routes.use("*"): this app is mounted at /api, so a wildcard
  // would also wrap the 404 fallback. Data changes only on import, so let clients revalidate (cheap with an ETag)
  // rather than serve stale lists. `private` because the session middleware may
  // attach a Set-Cookie to any response.
  const noCache = createMiddleware<AppEnv>(async (c, next) => {
    await next();
    c.header("Cache-Control", "private, no-cache");
  });
  const read = [etag(), noCache] as const;

  routes.get("/years", ...read, async (c) =>
    c.json({ years: await data.listYears() }),
  );

  routes.get("/years/:year/scores", ...read, async (c) => {
    const param = c.req.param("year");
    const rows = /^\d{1,4}$/.test(param)
      ? await data.getScores(Number(param))
      : null;
    return rows
      ? c.json({ player_game_scores: rows })
      : c.json({ error: "not_found" }, 404);
  });

  routes.get("/games", ...read, async (c) => c.json(await data.getGames()));

  return routes;
}
