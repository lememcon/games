import { describe, expect, it } from "vitest";

import { createAuth, createSessionResolver } from "./auth";
import type { Db } from "./db";
import type { Env } from "./env";

const env: Env = {
  DATABASE_URL: "postgres://unused",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://games.lememcon.com",
  DISCORD_CLIENT_ID: "id",
  DISCORD_CLIENT_SECRET: "secret",
  ADMIN_DISCORD_IDS: ["111111111111111111"],
  PORT: 8080,
};

describe("createAuth", () => {
  it("builds a handler that answers without touching the database", async () => {
    const auth = createAuth(env, {} as Db);
    const res = await auth.handler(
      new Request("https://games.lememcon.com/api/auth/ok"),
    );
    expect(res.status).toBe(200);
  });
});

describe("createSessionResolver", () => {
  const sessionFor = (userId: string | null) =>
    ({
      api: {
        getSession: async () =>
          userId ? { user: { id: userId, name: "Pat" } } : null,
      },
    }) as unknown as Parameters<typeof createSessionResolver>[0];

  // Fakes the single select().from().where().limit() chain.
  const dbWith = (rows: { accountId: string }[]) =>
    ({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => rows }) }),
      }),
    }) as unknown as Db;

  const resolve = (userId: string | null, rows: { accountId: string }[]) =>
    createSessionResolver(
      sessionFor(userId),
      dbWith(rows),
      env.ADMIN_DISCORD_IDS,
    )(new Headers());

  it("returns null without a session", async () => {
    expect(await resolve(null, [])).toBeNull();
  });

  it("grants admin to an allowlisted Discord id", async () => {
    expect(await resolve("u1", [{ accountId: "111111111111111111" }])).toEqual({
      id: "u1",
      name: "Pat",
      role: "admin",
    });
  });

  it("gives other Discord ids the user role", async () => {
    const result = await resolve("u1", [{ accountId: "222222222222222222" }]);
    expect(result?.role).toBe("user");
  });

  it("gives the user role when no Discord account is linked", async () => {
    expect((await resolve("u1", []))?.role).toBe("user");
  });
});
