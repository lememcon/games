import { Hono } from "hono";

import { parseDisplayName } from "../profile";
import type { AppEnv, ProfileStore } from "../types";
import { readJson } from "../validate";

/** Own display name and public profiles; both need an approved user (checked in app.ts). */
export function profileRoutes(profiles: ProfileStore) {
  const routes = new Hono<AppEnv>();

  routes.put("/me/display-name", async (c) => {
    const parsed = parseDisplayName(await readJson(c));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const user = c.get("user")!;
    const result = await profiles.setDisplayName(user.discordId, parsed.value);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    const { displayName } = result.value;
    return c.json({ name: displayName ?? user.discordName, displayName });
  });

  routes.get("/profiles/:discordId", async (c) => {
    const id = c.req.param("discordId");
    if (!/^\d{15,25}$/.test(id)) return c.json({ error: "invalid_id" }, 400);
    const profile = await profiles.getProfile(id);
    if (!profile) return c.json({ error: "not_found" }, 404);
    c.header("Cache-Control", "private, no-cache");
    return c.json(profile);
  });

  return routes;
}
