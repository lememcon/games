import { Hono } from "hono";

import { parseBggId } from "../played";
import { privateNoCache, refusalResponse } from "../result";
import type { AppEnv, MemberVetoStore } from "../types";

/** Members' game vetoes, shared by every year; all need an approved user (checked in app.ts). */
export function memberVetoRoutes(vetoes: MemberVetoStore) {
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

  return routes;
}
