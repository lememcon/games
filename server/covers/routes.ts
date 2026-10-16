import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { AppEnv } from "../types";
import type { CoverResult, CoverService } from "./service";

export const MAX_COVER_BYTES = 10 * 1024 * 1024;
const MAX_BGG_ID = 2_147_483_647;

/** A positive integer that fits the bgg_id column, or null. */
function parseBggId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return id <= MAX_BGG_ID ? id : null;
}

/**
 * Cover admin routes, mounted at /api/admin/covers. The /api/admin/* guard
 * (requireAdmin) and the CSRF check in createApp cover every route here.
 */
export function coverRoutes(service: CoverService) {
  const routes = new Hono<AppEnv>();
  const respond = <T>(
    c: Context<AppEnv>,
    result: CoverResult<T>,
    success: 200 | 202 = 200,
  ) =>
    result.ok
      ? c.json(result.value as object, success)
      : c.json({ error: result.error }, result.status);

  routes.get("/status", async (c) => c.json(await service.status()));

  routes.post("/mirror", async (c) => {
    const req = (await c.req.json().catch(() => null)) as {
      mode?: unknown;
    } | null;
    if (req?.mode !== "missing")
      return c.json({ error: "invalid_request" }, 400);
    return respond(c, await service.start({ mode: "missing" }), 202);
  });

  routes.get("/job", (c) => c.json(service.job()));
  routes.post("/job/cancel", (c) => c.json(service.cancel()));

  routes.put(
    "/:bggId",
    async (c, next) => {
      if (parseBggId(c.req.param("bggId")) === null)
        return c.json({ error: "invalid_id" }, 400);
      const type = c.req.header("content-type")?.split(";")[0].trim();
      if (!type?.toLowerCase().startsWith("image/"))
        return c.json({ error: "unsupported_media_type" }, 415);
      await next();
    },
    bodyLimit({
      maxSize: MAX_COVER_BYTES,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
    async (c) => {
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const bggId = parseBggId(c.req.param("bggId"))!;
      return respond(c, await service.upload(bggId, bytes));
    },
  );

  return routes;
}
