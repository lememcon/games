import { Hono } from "hono";

import { refusalResponse } from "../result";
import type { AppEnv, LinkStore } from "../types";
import { exactKeys, parseId32, readJson } from "../validate";

const MAX_DISCORD_ID_LENGTH = 32;

/** Admin player links, mounted at /api/admin behind requireAdmin. */
export function linkRoutes(links: LinkStore) {
  const routes = new Hono<AppEnv>();

  routes.get("/player-links", async (c) => c.json(await links.list()));

  routes.patch("/players/:id", async (c) => {
    const id = parseId32(c.req.param("id"));
    if (id === null) return c.json({ error: "invalid_id" }, 400);

    const body = await readJson(c);
    const discordId = exactKeys(body, "discordId") ? body.discordId : undefined;
    const valid =
      exactKeys(body, "discordId") &&
      (discordId === null ||
        (typeof discordId === "string" &&
          discordId.length <= MAX_DISCORD_ID_LENGTH &&
          /^\d+$/.test(discordId)));
    if (!valid) return c.json({ error: "invalid_body" }, 400);

    const result = await links.setLink(id, discordId as string | null);
    return result.ok ? c.body(null, 204) : refusalResponse(c, result);
  });

  return routes;
}
