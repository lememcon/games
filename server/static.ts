import { readFile } from "node:fs/promises";
import path from "node:path";

import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

import type { AppEnv } from "./types";

const IMMUTABLE = "public, max-age=31536000, immutable";
const SEVEN_DAYS = "public, max-age=604800";

/** Mirrors public/_headers (Netlify) plus Vite's hashed asset filenames. */
export function cacheControl(urlPath: string): string {
  if (urlPath.startsWith("/assets/")) {
    return /\.(png|jpe?g)$/.test(urlPath) ? SEVEN_DAYS : IMMUTABLE;
  }
  if (urlPath === "/" || urlPath.endsWith("/index.html")) return "no-cache";
  return "public, max-age=0, must-revalidate";
}

/** Serves built files, then falls back to index.html for client-side routes. */
export function mountStatic(app: Hono<AppEnv>, staticDir: string) {
  const root = path.relative(process.cwd(), staticDir) || ".";

  // serveStatic builds its response before onFound runs, so set the header
  // on the way back out instead.
  app.get("*", async (c, next) => {
    await next();
    if (c.res.ok && !c.res.headers.has("Cache-Control")) {
      c.res.headers.set("Cache-Control", cacheControl(c.req.path));
    }
  });
  app.get("*", serveStatic({ root }));

  app.get("*", async (c) => {
    // A missing file (e.g. a stale hashed asset) must 404, not return HTML.
    if (path.extname(c.req.path)) return c.text("Not Found", 404);
    const html = await readFile(path.join(staticDir, "index.html"), "utf8");
    return c.html(html, 200, { "Cache-Control": "no-cache" });
  });
}
