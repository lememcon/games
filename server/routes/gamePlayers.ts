import { Hono } from "hono";

import { refusalResponse } from "../result";
import type { AppEnv, DataStore, PlayerRange } from "../types";
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

/** Admin player count overrides, mounted at /api/admin behind requireAdmin. */
export function gamePlayerRoutes(data: DataStore) {
  const routes = new Hono<AppEnv>();

  routes.get("/game-players", async (c) =>
    c.json({ games: await data.listGamePlayers() }),
  );

  routes.put("/games/:bggId/players", async (c) => {
    const bggId = parseId32(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_id" }, 400);
    const range = parseRange(await readJson(c));
    if (!range) return c.json({ error: "invalid_body" }, 400);
    const result = await data.setPlayerOverride(
      bggId,
      range,
      c.get("user")!.discordId,
    );
    return result.ok ? c.body(null, 204) : refusalResponse(c, result);
  });

  routes.delete("/games/:bggId/players", async (c) => {
    const bggId = parseId32(c.req.param("bggId"));
    if (bggId === null) return c.json({ error: "invalid_id" }, 400);
    await data.clearPlayerOverride(bggId);
    return c.body(null, 204);
  });

  return routes;
}
