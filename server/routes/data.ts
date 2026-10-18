import { Hono } from "hono";
import { etag } from "hono/etag";
import { createMiddleware } from "hono/factory";

import { parseYear } from "../played";
import { privateNoCache } from "../result";
import type { AppEnv, DataStore } from "../types";

/**
 * Reads of years, one year's scores and all games (public), plus the signed-in
 * member's own top games (`/me/top-games`, approved members only).
 */
export function dataRoutes(data: DataStore) {
  const routes = new Hono<AppEnv>();

  // Per route, not routes.use("*"): this app is mounted at /api, so a wildcard
  // would also wrap the 404 fallback. Data changes only on import, so let clients revalidate (cheap with an ETag)
  // rather than serve stale lists. `private` because the session middleware may
  // attach a Set-Cookie to any response.
  const noCache = createMiddleware<AppEnv>(async (c, next) => {
    await next();
    privateNoCache(c);
  });
  const read = [etag(), noCache] as const;

  // A token that changes on every import; clients poll it to know when to refetch.
  routes.get("/data-version", ...read, async (c) =>
    c.json({ version: await data.getDataVersion() }),
  );

  routes.get("/years", ...read, async (c) =>
    c.json({ years: await data.listYears() }),
  );

  // Totals only: no player names or ids, so the same for every caller.
  routes.get("/years/totals", ...read, async (c) =>
    c.json({ totals: await data.getYearTotals() }),
  );

  routes.get("/years/:year/scores", ...read, async (c) => {
    const param = c.req.param("year");
    // Display names and profile ids are for approved sessions only, so the
    // response varies by caller and must not be shared from a cache.
    const approved = c.get("user")?.status === "approved";
    const rows = /^\d{1,4}$/.test(param)
      ? await data.getScores(Number(param), approved)
      : null;
    c.header("Vary", "Cookie", { append: true });
    return rows
      ? c.json({ player_game_scores: rows })
      : c.json({ error: "not_found" }, 404);
  });

  // Approved members only (not in app.ts isPublic). A literal path, so no
  // /games/:id route can shadow it.
  routes.get("/games/unplayed", ...read, async (c) =>
    c.json({ games: await data.listUnplayedGames() }),
  );

  // Approved members only (not in app.ts isPublic). Varies by caller.
  routes.get("/me/top-games", ...read, async (c) => {
    const year = parseYear(c.req.query("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const games = await data.getTopGames(year, c.get("user")!.discordId);
    c.header("Vary", "Cookie", { append: true });
    if (!games) return c.json({ error: "unknown_year" }, 404);
    return c.json({ games });
  });

  routes.get("/games", ...read, async (c) => c.json(await data.getGames()));

  return routes;
}
