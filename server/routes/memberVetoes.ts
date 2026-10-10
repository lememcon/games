import { Hono } from "hono";

import { parseBggId, parseYear } from "../played";
import { privateNoCache, refusalResponse } from "../result";
import type { AppEnv, MemberVetoStore } from "../types";

/** Members' per-year game vetoes; all need an approved user (checked in app.ts). */
export function memberVetoRoutes(vetoes: MemberVetoStore) {
  const routes = new Hono<AppEnv>();

  routes.get("/vetoes", async (c) => {
    const year = parseYear(c.req.query("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const all = await vetoes.getAll(year);
    if (!all) return c.json({ error: "unknown_year" }, 404);
    privateNoCache(c);
    return c.json({ vetoes: all });
  });

  routes.get("/me/vetoes", async (c) => {
    const mine = await vetoes.listMine(c.get("user")!.discordId);
    privateNoCache(c);
    return c.json({ vetoes: mine });
  });

  routes.put("/me/vetoes/:year/:bggId", async (c) => {
    const year = parseYear(c.req.param("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const bggId = parseBggId(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_bgg_id" }, 400);
    const result = await vetoes.set(c.get("user")!.discordId, year, bggId);
    return result.ok ? c.body(null, 204) : refusalResponse(c, result);
  });

  routes.delete("/me/vetoes/:year/:bggId", async (c) => {
    const year = parseYear(c.req.param("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const bggId = parseBggId(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_bgg_id" }, 400);
    await vetoes.clear(c.get("user")!.discordId, year, bggId);
    return c.body(null, 204);
  });

  return routes;
}
