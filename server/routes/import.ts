import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { cleanFilename, parseImport } from "../import";
import { refusalResponse } from "../result";
import type { AppEnv, DataStore } from "../types";

export const MAX_BODY_BYTES = 5 * 1024 * 1024;

/** Admin import, mounted at /api/admin behind requireAdmin. */
export function importRoutes(data: DataStore) {
  const routes = new Hono<AppEnv>();

  routes.post(
    "/import",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
    async (c) => {
      let raw: unknown;
      try {
        raw = JSON.parse(await c.req.text());
      } catch {
        return c.json({ error: "invalid_json" }, 400);
      }

      const parsed = parseImport(raw);
      if (!parsed.ok)
        return c.json({ error: "invalid_import", errors: parsed.errors }, 422);

      const result = await data.importData(parsed.value, {
        importedBy: c.get("user")!.discordId,
        sourceFilename: cleanFilename(c.req.query("filename")),
      });
      return result.ok ? c.json(result.value, 201) : refusalResponse(c, result);
    },
  );

  return routes;
}
