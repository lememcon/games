import { Hono } from "hono";

import { privateNoCache, refusalResponse } from "../result";
import type { AppEnv, MemberOverrideStore } from "../types";
import { parseId32, readJson } from "../validate";
import { parseRange } from "./gamePlayers";

/** Members' own player count ranges; all need an approved user (checked in app.ts). */
export function memberOverrideRoutes(overrides: MemberOverrideStore) {
  const routes = new Hono<AppEnv>();

  routes.get("/player-overrides", async (c) => {
    const all = await overrides.getAll();
    privateNoCache(c);
    return c.json({
      overrides: Object.entries(all).flatMap(([discordId, byGame]) =>
        Object.entries(byGame).map(([bggId, { min, max }]) => ({
          discordId,
          bggId: Number(bggId),
          min,
          max,
        })),
      ),
    });
  });

  routes.put("/me/player-overrides/:bggId", async (c) => {
    const bggId = parseId32(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_id" }, 400);
    const range = parseRange(await readJson(c));
    if (!range) return c.json({ error: "invalid_body" }, 400);
    const result = await overrides.set(c.get("user")!.discordId, bggId, range);
    return result.ok ? c.body(null, 204) : refusalResponse(c, result);
  });

  routes.delete("/me/player-overrides/:bggId", async (c) => {
    const bggId = parseId32(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_id" }, 400);
    await overrides.clear(c.get("user")!.discordId, bggId);
    return c.body(null, 204);
  });

  return routes;
}
