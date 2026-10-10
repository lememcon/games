import { Hono } from "hono";

import { privateNoCache, refusalResponse } from "../result";
import type { AppEnv, MemberOverrideStore, PlayerRange } from "../types";
import { isRecord, parseId32, readJson } from "../validate";

const MAX_PLAYERS = 99;

const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_PLAYERS;

/** A body of exactly `{min, max}`: integers 1..99 with min <= max; else null. */
export function parseRange(body: unknown): PlayerRange | null {
  if (!isRecord(body)) return null;
  const keys = Object.keys(body).sort();
  if (keys.length !== 2 || keys[0] !== "max" || keys[1] !== "min") return null;
  const { min, max } = body;
  return isCount(min) && isCount(max) && min <= max ? { min, max } : null;
}

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
