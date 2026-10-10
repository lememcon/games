import { Hono } from "hono";

import { refusalResponse } from "./result";
import { effectiveUser, isProtected } from "./roles";
import type { AdminUser, AppEnv, StoredUser, UserStore } from "./types";
import { readJson } from "./validate";

function toAdminUser(stored: StoredUser): AdminUser {
  return {
    discordId: stored.discordId,
    name: stored.name ?? "Unknown",
    displayName: stored.displayName,
    image: stored.image,
    username: stored.username,
    ...effectiveUser(stored.discordId, stored),
    locked: isProtected(stored.discordId),
    createdAt: stored.createdAt.toISOString(),
  };
}

/** Pending first, then oldest first. */
function byQueue(a: AdminUser, b: AdminUser) {
  const pending =
    Number(b.status === "pending") - Number(a.status === "pending");
  return pending || a.createdAt.localeCompare(b.createdAt);
}

/** Admin routes, mounted at /api/admin behind requireAdmin. */
export function adminRoutes(store: UserStore) {
  const routes = new Hono<AppEnv>();

  routes.get("/users", async (c) =>
    c.json((await store.list()).map(toAdminUser).sort(byQueue)),
  );

  routes.patch("/users/:discordId", async (c) => {
    const body = await readJson(c);
    const result = await store.update(
      c.get("user")!.discordId,
      c.req.param("discordId"),
      body,
    );
    if (!result.ok) return refusalResponse(c, result);
    return c.json(toAdminUser(result.value));
  });

  routes.delete("/users/:discordId", async (c) => {
    const result = await store.remove(
      c.get("user")!.discordId,
      c.req.param("discordId"),
    );
    if (!result.ok) return refusalResponse(c, result);
    return c.body(null, 204);
  });

  return routes;
}
