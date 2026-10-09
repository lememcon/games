import { Hono, type Context } from "hono";

import type { AppEnv } from "../types";
import { normalizeIds } from "./needed";
import type { BggService, Result } from "./service";

const MAX_KEY_LENGTH = 200;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** A trimmed, non-empty key without control characters or newlines. */
function parseApiKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return key.length > 0 &&
    key.length <= MAX_KEY_LENGTH &&
    !CONTROL_CHARS.test(key)
    ? key
    : null;
}

/**
 * BGG admin routes, mounted at /api/admin/bgg. The /api/admin/* guard
 * (requireAdmin) and the CSRF check in createApp cover every route here.
 */
export function bggRoutes(service: BggService) {
  const routes = new Hono<AppEnv>();
  const body = (c: Context<AppEnv>) =>
    c.req.json().catch(() => null) as Promise<Record<string, unknown> | null>;
  const respond = <T>(
    c: Context<AppEnv>,
    result: Result<T>,
    success: 200 | 202 = 200,
  ) =>
    result.ok
      ? c.json(result.value as object, success)
      : c.json({ error: result.error, ...result.extra }, result.status);

  routes.get("/key", async (c) => c.json(await service.getKey()));

  routes.put("/key", async (c) => {
    const apiKey = parseApiKey((await body(c))?.apiKey);
    if (apiKey === null) return c.json({ error: "invalid_key" }, 400);
    await service.setKey(apiKey, c.get("user")!.discordId);
    return c.json(await service.getKey());
  });

  routes.delete("/key", async (c) => {
    await service.deleteKey();
    return c.body(null, 204);
  });

  routes.post("/key/test", async (c) => {
    const raw = (await body(c))?.apiKey;
    const candidate = raw === undefined ? undefined : parseApiKey(raw);
    if (candidate === null) return c.json({ error: "invalid_key" }, 400);
    return respond(c, await service.testKey(candidate));
  });

  routes.get("/status", async (c) => respond(c, await service.status()));

  routes.post("/download", async (c) => {
    const req = await body(c);
    if (req?.mode === "missing")
      return respond(c, await service.startDownload({ mode: "missing" }), 202);
    const ids = req?.mode === "ids" ? normalizeIds(req.ids) : null;
    if (!ids) return c.json({ error: "invalid_request" }, 400);
    return respond(c, await service.startDownload({ mode: "ids", ids }), 202);
  });

  routes.get("/job", (c) => c.json(service.job()));
  routes.post("/job/cancel", (c) => c.json(service.cancel()));

  return routes;
}
