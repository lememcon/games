import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { requireAdmin, requireApproved } from "./middleware";
import type { AppEnv, AppUser } from "./types";

const base = {
  discordId: "222222222222222222",
  name: "Pat",
  displayName: null,
  discordName: "Pat",
  image: null,
};
const member: AppUser = { ...base, role: "member", status: "approved" };
const admin: AppUser = { ...member, role: "admin" };
const pending: AppUser = { ...member, status: "pending" };
const pendingAdmin: AppUser = { ...admin, status: "pending" };

function appWith(user: AppUser | null) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", user);
    await next();
  });
  app.get("/approved", requireApproved, (c) => c.text("ok"));
  app.get("/admin", requireAdmin, (c) => c.text("ok"));
  return app;
}

const status = async (user: AppUser | null, path: string) =>
  (await appWith(user).request(path)).status;

describe("requireApproved", () => {
  it("answers 401 anonymous, 403 pending, 200 approved", async () => {
    expect(await status(null, "/approved")).toBe(401);
    expect(await status(pending, "/approved")).toBe(403);
    expect(await status(member, "/approved")).toBe(200);
  });
});

describe("requireAdmin", () => {
  it("answers 401 anonymous, 403 member or pending admin, 200 admin", async () => {
    expect(await status(null, "/admin")).toBe(401);
    expect(await status(member, "/admin")).toBe(403);
    expect(await status(pendingAdmin, "/admin")).toBe(403);
    expect(await status(admin, "/admin")).toBe(200);
  });
});
