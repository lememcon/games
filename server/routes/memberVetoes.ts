import { Hono } from "hono";

import { parseBggId, parseYear } from "../played";
import { privateNoCache, refusalResponse } from "../result";
import type { AppEnv, MemberVetoStore, MemberYearVetoStore } from "../types";

/**
 * Members' game vetoes: permanent ones shared by every year (`/vetoes`) and
 * year-only ones (`/year-vetoes`); all need an approved user (checked in app.ts).
 */
export function memberVetoRoutes(
  vetoes: MemberVetoStore,
  yearVetoes: MemberYearVetoStore,
) {
  const routes = new Hono<AppEnv>();

  routes.get("/vetoes", async (c) => {
    const all = await vetoes.getAll();
    privateNoCache(c);
    return c.json({ vetoes: all });
  });

  routes.get("/me/vetoes", async (c) => {
    const mine = await vetoes.listMine(c.get("user")!.discordId);
    privateNoCache(c);
    return c.json({ vetoes: mine });
  });

  routes.put("/me/vetoes/:bggId", async (c) => {
    const bggId = parseBggId(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_bgg_id" }, 400);
    const result = await vetoes.set(c.get("user")!.discordId, bggId);
    return result.ok ? c.body(null, 204) : refusalResponse(c, result);
  });

  routes.delete("/me/vetoes/:bggId", async (c) => {
    const bggId = parseBggId(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_bgg_id" }, 400);
    await vetoes.clear(c.get("user")!.discordId, bggId);
    return c.body(null, 204);
  });

  routes.get("/year-vetoes/:year", async (c) => {
    const year = parseYear(c.req.param("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const all = await yearVetoes.getAll(year);
    if (!all) return c.json({ error: "unknown_year" }, 404);
    privateNoCache(c);
    return c.json({ vetoes: all });
  });

  routes.get("/me/year-vetoes", async (c) => {
    const mine = await yearVetoes.listMine(c.get("user")!.discordId);
    privateNoCache(c);
    return c.json({ vetoes: mine });
  });

  routes.put("/me/year-vetoes/:year/:bggId", async (c) => {
    const year = parseYear(c.req.param("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const bggId = parseBggId(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_bgg_id" }, 400);
    const result = await yearVetoes.set(c.get("user")!.discordId, year, bggId);
    return result.ok ? c.body(null, 204) : refusalResponse(c, result);
  });

  routes.delete("/me/year-vetoes/:year/:bggId", async (c) => {
    const year = parseYear(c.req.param("year"));
    if (year === null) return c.json({ error: "invalid_year" }, 400);
    const bggId = parseBggId(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_bgg_id" }, 400);
    await yearVetoes.clear(c.get("user")!.discordId, year, bggId);
    return c.body(null, 204);
  });

  return routes;
}
