import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { mountStatic } from "./static";
import type { AppEnv } from "./types";

describe("mountStatic", () => {
  it("serves files when staticDir is the working directory", async () => {
    const app = new Hono<AppEnv>();
    mountStatic(app, process.cwd());

    const res = await app.request("/package.json");

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
  });
});
