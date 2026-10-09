import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { requireUser } from "./middleware";
import type { AppEnv, AppUser } from "./types";

function appWith(user: AppUser | null) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", user);
    await next();
  });
  app.get("/private", requireUser, (c) => c.text("ok"));
  return app;
}

describe("requireUser", () => {
  it("rejects anonymous with 401", async () => {
    expect((await appWith(null).request("/private")).status).toBe(401);
  });

  it("allows any signed-in user", async () => {
    const res = await appWith({ id: "u1", name: "Pat", role: "user" }).request(
      "/private",
    );
    expect(res.status).toBe(200);
  });
});
