import { Hono, type Context } from "hono";

import type { AppEnv } from "../types";
import type { CoverConfig, SaveFail } from "./config";

const invalid = (c: Context<AppEnv>, fail: SaveFail) =>
  c.json(
    {
      error: "invalid_storage",
      field: fail.field,
      ...(fail.code ? { code: fail.code } : {}),
    },
    400,
  );

/**
 * Cover storage settings, mounted at /api/admin/cover-storage. The
 * /api/admin/* guard (requireAdmin) and the CSRF check in createApp cover every
 * route here. The secret key is accepted but never returned or logged.
 */
export function storageRoutes(config: CoverConfig) {
  const routes = new Hono<AppEnv>();
  const body = (c: Context<AppEnv>) =>
    c.req.json().catch(() => null) as Promise<unknown>;

  routes.get("/", async (c) => c.json(await config.info()));

  routes.put("/", async (c) => {
    const result = await config.set(await body(c), c.get("user")!.discordId);
    return result.ok ? c.json(await config.info()) : invalid(c, result);
  });

  routes.delete("/", async (c) => {
    await config.clear();
    return c.body(null, 204);
  });

  routes.post("/test", async (c) => {
    const raw = await body(c);
    const isEmpty =
      typeof raw === "object" &&
      raw !== null &&
      !Array.isArray(raw) &&
      Object.keys(raw).length === 0;
    const result = await (isEmpty
      ? config.testStorage()
      : config.testStorage(raw));
    if (result.ok) return c.json(result.value);
    if (result.status === 400) return invalid(c, result);
    return c.json({ error: result.error }, result.status);
  });

  return routes;
}
