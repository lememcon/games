import { Hono } from "hono";

import type { AppEnv, LinkStore } from "../types";

const MAX_PLAYER_ID = 2147483647;
const MAX_DISCORD_ID_LENGTH = 32;

/** Admin player links, mounted at /api/admin behind requireAdmin. */
export function linkRoutes(links: LinkStore) {
  const routes = new Hono<AppEnv>();

  routes.get("/player-links", async (c) => c.json(await links.list()));

  routes.patch("/players/:id", async (c) => {
    const raw = c.req.param("id");
    const id = /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : NaN;
    if (!(id <= MAX_PLAYER_ID)) return c.json({ error: "invalid_id" }, 400);

    const body = (await c.req.json().catch(() => null)) as {
      discordId?: unknown;
    } | null;
    const keys = body && typeof body === "object" ? Object.keys(body) : [];
    const discordId = body?.discordId;
    const valid =
      keys.length === 1 &&
      keys[0] === "discordId" &&
      (discordId === null ||
        (typeof discordId === "string" &&
          discordId.length <= MAX_DISCORD_ID_LENGTH &&
          /^\d+$/.test(discordId)));
    if (!valid) return c.json({ error: "invalid_body" }, 400);

    const result = await links.setLink(id, discordId as string | null);
    return result.ok
      ? c.body(null, 204)
      : c.json({ error: result.error }, result.status);
  });

  return routes;
}
