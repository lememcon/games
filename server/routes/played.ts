import { Hono } from "hono";

import { parseBggId, parseCount, parseImportBody, parseYear } from "../played";
import { privateNoCache, refusalResponse } from "../result";
import type { AppEnv, PlayedStore } from "../types";
import { readJson } from "../validate";

/** The signed-in member's own played counts; all need an approved user (checked in app.ts). */
export function playedRoutes(played: PlayedStore) {
  const routes = new Hono<AppEnv>();

  routes.get("/me/played", async (c) => {
    const year = parseYear(c.req.query("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const counts = await played.get(c.get("user")!.discordId, year);
    if (!counts) return c.json({ error: "unknown_year" }, 404);
    privateNoCache(c);
    return c.json({ counts });
  });

  routes.put("/me/played/:year/:bggId", async (c) => {
    const year = parseYear(c.req.param("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const bggId = parseBggId(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_bgg_id" }, 400);
    const parsed = parseCount(await readJson(c));
    if (!parsed.ok) return c.json({ error: "invalid_body" }, 400);

    const result = await played.set(
      c.get("user")!.discordId,
      year,
      bggId,
      parsed.value,
    );
    if (!result.ok) return refusalResponse(c, result);
    return c.json({ count: parsed.value });
  });

  routes.post("/me/played/:year/import", async (c) => {
    const year = parseYear(c.req.param("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const parsed = parseImportBody(await readJson(c));
    if (!parsed.ok) return c.json({ error: "invalid_body" }, 400);

    const result = await played.importCounts(
      c.get("user")!.discordId,
      year,
      parsed.value,
    );
    if (!result.ok) return refusalResponse(c, result);
    return c.json({ counts: result.value });
  });

  return routes;
}
