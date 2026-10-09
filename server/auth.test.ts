import { describe, expect, it } from "vitest";

import { createAuth, createSessionResolver } from "./auth";
import type { Db } from "./db";
import type { Env } from "./env";
import { PROTECTED_ADMIN_IDS } from "./roles";
import { fakeStore } from "./testing";

const env: Env = {
  DATABASE_URL: "postgres://unused",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://games.lememcon.com",
  DISCORD_CLIENT_ID: "id",
  DISCORD_CLIENT_SECRET: "secret",
  WEB_ORIGIN: "https://games.lememcon.com",
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

describe("createAuth hardening", () => {
  const auth = createAuth(env, {} as Db);
  const post = (path: string) =>
    auth.handler(
      new Request(`https://games.lememcon.com/api/auth${path}`, {
        method: "POST",
        headers: {
          origin: "https://games.lememcon.com",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );

  it.each(["/update-user", "/link-social", "/unlink-account"])(
    "disables %s",
    async (path) => {
      expect((await post(path)).status).toBe(404);
    },
  );

  it("keeps the session cookie cache and implicit linking off", () => {
    expect(auth.options.session.cookieCache.enabled).toBe(false);
    expect(auth.options.account.accountLinking.enabled).toBe(false);
  });

  it("trusts the web origin, and only sets a cookie domain when configured", () => {
    expect(auth.options.trustedOrigins).toEqual([
      "https://games.lememcon.com",
      "https://games.lememcon.com",
    ]);
    expect(auth.options.advanced.crossSubDomainCookies).toBeUndefined();
    const prod = createAuth(
      { ...env, COOKIE_DOMAIN: ".lememcon.com", WEB_ORIGIN: undefined },
      {} as Db,
    );
    expect(prod.options.advanced.crossSubDomainCookies).toEqual({
      enabled: true,
      domain: ".lememcon.com",
    });
    expect(prod.options.trustedOrigins).toEqual(["https://games.lememcon.com"]);
  });
});

describe("discord mapProfileToUser", () => {
  it("synthesizes an unverified placeholder email and keeps the username", async () => {
    const mapProfile = createAuth(env, {} as Db).options.socialProviders.discord
      .mapProfileToUser!;

    const user = await mapProfile({
      id: "123",
      username: "sam_k",
    } as Parameters<typeof mapProfile>[0]);

    expect(user).toEqual({
      email: "123@discord.invalid",
      emailVerified: false,
      username: "sam_k",
    });
  });
});

describe("createSessionResolver", () => {
  const ALEX = "998877665544332211";
  const [KELSIN] = PROTECTED_ADMIN_IDS;

  const sessionFor = (userId: string | null) =>
    ({
      api: {
        getSession: async () => ({
          headers: new Headers({ "set-cookie": "session=refreshed" }),
          response: userId
            ? { user: { id: userId, name: "Pat", image: "pat.png" } }
            : null,
        }),
      },
    }) as unknown as Parameters<typeof createSessionResolver>[0];

  function setup(
    discordIds: string[],
    rows: Parameters<typeof fakeStore>[0] = {},
  ) {
    const fake = fakeStore(rows);
    fake.logins.u1 = discordIds;
    return fake;
  }
  const resolve = (
    fake: ReturnType<typeof setup>,
    userId: string | null = "u1",
  ) => createSessionResolver(sessionFor(userId), fake.store)(new Headers());

  it("returns null without a session", async () => {
    expect((await resolve(setup([ALEX]), null)).user).toBeNull();
  });

  it("creates an unknown Discord id as a pending member, never approved", async () => {
    const fake = setup([ALEX]);
    const { user, headers } = await resolve(fake);
    expect(user).toEqual({
      discordId: ALEX,
      name: "Pat",
      image: "pat.png",
      role: "member",
      status: "pending",
    });
    expect(fake.users.get(ALEX)).toEqual({ role: "member", status: "pending" });
    expect(headers?.getSetCookie()).toEqual(["session=refreshed"]);
  });

  it("applies the stored role and status on the next request", async () => {
    const fake = setup([ALEX], {
      [ALEX]: { role: "member", status: "approved" },
    });
    expect((await resolve(fake)).user).toMatchObject({
      role: "member",
      status: "approved",
    });
    fake.users.set(ALEX, { role: "admin", status: "approved" });
    expect((await resolve(fake)).user).toMatchObject({ role: "admin" });
    fake.users.set(ALEX, { role: "admin", status: "pending" });
    expect((await resolve(fake)).user).toMatchObject({ status: "pending" });
  });

  it("makes a built-in admin approved even with a tampered row, and repairs it", async () => {
    const fake = setup([KELSIN], {
      [KELSIN]: { role: "member", status: "pending" },
    });
    expect((await resolve(fake)).user).toMatchObject({
      role: "admin",
      status: "approved",
    });
    expect(fake.repaired).toEqual([KELSIN]);
  });

  it("does not repair a built-in admin whose row is already correct", async () => {
    const fake = setup([KELSIN], {
      [KELSIN]: { role: "admin", status: "approved" },
    });
    await resolve(fake);
    expect(fake.repaired).toEqual([]);
  });

  it("resolves anonymous for zero or multiple Discord accounts", async () => {
    expect((await resolve(setup([]))).user).toBeNull();
    const two = setup([ALEX, KELSIN]);
    const { user, headers } = await resolve(two);
    expect(user).toBeNull();
    expect(headers?.getSetCookie()).toEqual(["session=refreshed"]);
    expect(two.users.size).toBe(0);
  });
});
