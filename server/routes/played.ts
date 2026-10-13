import { Hono } from "hono";

import {
  parseBggId,
  parseImportBody,
  parsePlayedBody,
  parsePlayersBody,
  parseYear,
} from "../played";
import { privateNoCache, refusalResponse } from "../result";
import type { AppEnv, PlayedStore } from "../types";
import { readJson } from "../validate";

/**
 * Played games: everyone's (`/played`) and the signed-in member's own
 * (`/me/played`); all need an approved user (checked in app.ts). Responses
 * carry `played` (bgg id arrays, or a boolean for a single set).
 */
export function playedRoutes(played: PlayedStore) {
  const routes = new Hono<AppEnv>();

  routes.get("/played", async (c) => {
    const year = parseYear(c.req.query("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const all = await played.getAll(year);
    if (!all) return c.json({ error: "unknown_year" }, 404);
    privateNoCache(c);
    return c.json({ played: all });
  });

  routes.post("/played/:year/:bggId", async (c) => {
    const year = parseYear(c.req.param("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const bggId = parseBggId(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_bgg_id" }, 400);
    const parsed = parsePlayersBody(await readJson(c));
    if (!parsed.ok) return c.json({ error: "invalid_body" }, 400);

    const result = await played.markPlayed(parsed.value, year, bggId);
    if (!result.ok) return refusalResponse(c, result);
    privateNoCache(c);
    return c.json({ played: result.value });
  });

  routes.get("/me/played", async (c) => {
    const year = parseYear(c.req.query("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const games = await played.get(c.get("user")!.discordId, year);
    if (!games) return c.json({ error: "unknown_year" }, 404);
    privateNoCache(c);
    return c.json({ played: games });
  });

  routes.put("/me/played/:year/:bggId", async (c) => {
    const year = parseYear(c.req.param("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const bggId = parseBggId(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_bgg_id" }, 400);
    const parsed = parsePlayedBody(await readJson(c));
    if (!parsed.ok) return c.json({ error: "invalid_body" }, 400);

    const result = await played.set(
      c.get("user")!.discordId,
      year,
      bggId,
      parsed.value,
    );
    if (!result.ok) return refusalResponse(c, result);
    return c.json({ played: parsed.value });
  });

  routes.post("/me/played/:year/import", async (c) => {
    const year = parseYear(c.req.param("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const parsed = parseImportBody(await readJson(c));
    if (!parsed.ok) return c.json({ error: "invalid_body" }, 400);

    const result = await played.importPlayed(
      c.get("user")!.discordId,
      year,
      parsed.value,
    );
    if (!result.ok) return refusalResponse(c, result);
    return c.json({ played: result.value });
  });

  return routes;
}
