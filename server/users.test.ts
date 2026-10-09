import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { PROTECTED_ADMIN_IDS } from "./roles";
import { fakeStore } from "./testing";
import type { AdminUser, AppEnv, AppUser } from "./types";
import { adminRoutes } from "./users";

const [KELSIN] = PROTECTED_ADMIN_IDS;
const ALEX = "998877665544332211";
const SAM = "123456789012345678";
const JO = "777666555444333222";

const actor: AppUser = {
  discordId: ALEX,
  name: "Alex",
  image: null,
  role: "admin",
  status: "approved",
};

function setup() {
  const fake = fakeStore({
    [ALEX]: {
      role: "admin",
      status: "approved",
      name: "Alex",
      createdAt: new Date("2026-01-02"),
    },
    [SAM]: {
      role: "member",
      status: "pending",
      name: "Sam",
      username: "sam_k",
      createdAt: new Date("2026-01-04"),
    },
    [JO]: {
      role: "member",
      status: "pending",
      createdAt: new Date("2026-01-03"),
    },
    // Tampered row: still reported as a locked approved admin.
    [KELSIN]: {
      role: "member",
      status: "pending",
      createdAt: new Date("2026-01-01"),
    },
  });
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", actor);
    await next();
  });
  app.route("/", adminRoutes(fake.store));
  return { app, ...fake };
}

const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("GET /users", () => {
  it("lists pending users first, oldest first, with effective roles", async () => {
    const res = await setup().app.request("/users");
    const users = (await res.json()) as AdminUser[];
    expect(users.map((u) => u.discordId)).toEqual([JO, SAM, KELSIN, ALEX]);
    expect(users[1]).toEqual({
      discordId: SAM,
      name: "Sam",
      image: null,
      username: "sam_k",
      role: "member",
      status: "pending",
      locked: false,
      createdAt: "2026-01-04T00:00:00.000Z",
    });
    expect(users[0].name).toBe("Unknown");
  });

  it("reports a tampered built-in row as a locked approved admin", async () => {
    const users = (await (
      await setup().app.request("/users")
    ).json()) as AdminUser[];
    expect(users.find((u) => u.discordId === KELSIN)).toMatchObject({
      role: "admin",
      status: "approved",
      locked: true,
    });
  });
});

describe("PATCH /users/:discordId", () => {
  it("approves a pending user and returns it", async () => {
    const { app, users } = setup();
    const res = await app.request(
      `/users/${SAM}`,
      json("PATCH", { status: "approved" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      discordId: SAM,
      status: "approved",
    });
    expect(users.get(SAM)?.status).toBe("approved");
  });

  it.each([
    [KELSIN, { role: "member" }, 409, "locked"],
    ["999999999999999999", { role: "member" }, 404, "not_found"],
    [SAM, { role: "admin" }, 400, "approve_first"],
    [SAM, { admin: true }, 400, "invalid_body"],
    ["abc", { role: "member" }, 400, "invalid_id"],
  ])("maps %s %j to %i %s", async (id, body, status, error) => {
    const res = await setup().app.request(`/users/${id}`, json("PATCH", body));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it("treats an unparseable body as invalid", async () => {
    const res = await setup().app.request(`/users/${SAM}`, {
      method: "PATCH",
      body: "{nope",
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /users/:discordId", () => {
  it("removes a user with 204", async () => {
    const { app, users } = setup();
    const res = await app.request(`/users/${SAM}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(users.has(SAM)).toBe(false);
  });

  it("refuses built-in and unknown targets", async () => {
    const { app } = setup();
    const locked = await app.request(`/users/${KELSIN}`, { method: "DELETE" });
    expect([locked.status, await locked.json()]).toEqual([
      409,
      { error: "locked" },
    ]);
    const missing = await app.request("/users/999999999999999999", {
      method: "DELETE",
    });
    expect(missing.status).toBe(404);
  });
});
