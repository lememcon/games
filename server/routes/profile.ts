import { Hono } from "hono";

import { parseColor } from "../colors";
import { parseDisplayName } from "../profile";
import { privateNoCache, refusalResponse } from "../result";
import type { AppEnv, ProfileStore } from "../types";
import { readJson } from "../validate";

/** Own display name, own color and public profiles; both need an approved user (checked in app.ts). */
export function profileRoutes(profiles: ProfileStore) {
  const routes = new Hono<AppEnv>();

  routes.put("/me/display-name", async (c) => {
    const parsed = parseDisplayName(await readJson(c));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const user = c.get("user")!;
    const result = await profiles.setDisplayName(user.discordId, parsed.value);
    if (!result.ok) return refusalResponse(c, result);
    const { displayName } = result.value;
    return c.json({ name: displayName ?? user.discordName, displayName });
  });

  routes.put("/me/color", async (c) => {
    const parsed = parseColor(await readJson(c));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const result = await profiles.setColor(
      c.get("user")!.discordId,
      parsed.value,
    );
    if (!result.ok) return refusalResponse(c, result);
    return c.json({ color: result.value.color });
  });

  routes.get("/profiles/:discordId", async (c) => {
    const id = c.req.param("discordId");
    if (!/^\d{15,25}$/.test(id)) return c.json({ error: "invalid_id" }, 400);
    const profile = await profiles.getProfile(id);
    if (!profile) return c.json({ error: "not_found" }, 404);
    privateNoCache(c);
    return c.json(profile);
  });

  return routes;
}
