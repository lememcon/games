import { createHmac } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createAuth, createSessionResolver } from "../auth";
import type { Env } from "../env";
import { PROTECTED_ADMIN_IDS } from "../roles";
import { addLogin, createTestDb } from "./testDb";
import { createUserStore } from "./userStore";

const env: Env = {
  DATABASE_URL: "unused",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:8080",
  DISCORD_CLIENT_ID: "id",
  DISCORD_CLIENT_SECRET: "secret",
  PORT: 8080,
};
const [KELSIN] = PROTECTED_ADMIN_IDS;
const ALEX = "998877665544332211";

/** The cookie Better Auth would issue for a session token. */
const cookieFor = (token: string) => {
  const signature = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(token)
    .digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
};

describe("session resolver against Better Auth and Postgres", () => {
  let client: PGlite;
  let resolve: ReturnType<typeof createSessionResolver>;
  let store: ReturnType<typeof createUserStore>;

  beforeAll(async () => {
    const test = await createTestDb();
    client = test.client;
    store = createUserStore(test.db);
    // PGlite's drizzle client has the same schema API as the node-postgres one.
    const auth = createAuth(
      env,
      test.db as unknown as Parameters<typeof createAuth>[1],
    );
    resolve = createSessionResolver(auth, store);
  });
  afterAll(() => client.close());

  it("resolves a real session to a pending member and picks up approval", async () => {
    const userId = await addLogin(client, ALEX, "Alex");
    const headers = new Headers({ cookie: cookieFor(`t${userId}`) });

    const first = await resolve(headers);
    expect(first.user).toMatchObject({
      discordId: ALEX,
      name: "Alex",
      role: "member",
      status: "pending",
    });
    // No signed session_data cookie: nothing is cached client-side.
    expect(first.headers?.getSetCookie().join(";") ?? "").not.toContain(
      "session_data",
    );

    await store.update(KELSIN, ALEX, { status: "approved" });
    expect((await resolve(headers)).user).toMatchObject({ status: "approved" });
  });

  it("stops resolving as soon as the user is removed", async () => {
    const userId = await addLogin(client, "123456789012345678", "Sam");
    const headers = new Headers({ cookie: cookieFor(`t${userId}`) });
    expect((await resolve(headers)).user).not.toBeNull();

    await store.remove(KELSIN, "123456789012345678");
    expect((await resolve(headers)).user).toBeNull();
  });

  it("fails closed for a login with no Discord account", async () => {
    await client.exec(
      `INSERT INTO "user" (id, name, email) VALUES ('nodiscord', 'X', 'x@x.invalid');
       INSERT INTO session (id, expires_at, token, updated_at, user_id)
         VALUES ('snd', now() + interval '1 day', 'tnd', now(), 'nodiscord');`,
    );
    expect(
      (await resolve(new Headers({ cookie: cookieFor("tnd") }))).user,
    ).toBeNull();
  });
});

describe("Discord sign-in against Better Auth and Postgres", () => {
  let client: PGlite;
  let auth: ReturnType<typeof createAuth>;

  beforeAll(async () => {
    const test = await createTestDb();
    client = test.client;
    auth = createAuth(
      env,
      test.db as unknown as Parameters<typeof createAuth>[1],
    );
  });
  afterAll(() => client.close());

  /** Runs the real OAuth callback with Discord's HTTP endpoints stubbed. */
  async function signIn(profile: { id: string; username: string }) {
    const start = await auth.handler(
      new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: env.BETTER_AUTH_URL,
        },
        body: JSON.stringify({ provider: "discord", callbackURL: "/" }),
      }),
    );
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get("state")!;
    const cookie = start.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    const realFetch = globalThis.fetch;
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const href = input instanceof Request ? input.url : String(input);
        if (href.includes("discord.com/api/oauth2/token"))
          return Response.json({
            access_token: "at",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "identify",
          });
        if (href.includes("discord.com/api/users/"))
          return Response.json({
            ...profile,
            global_name: profile.username,
            avatar: null,
            discriminator: "0",
          });
        return realFetch(input, init);
      });
    try {
      return await auth.handler(
        new Request(
          `${env.BETTER_AUTH_URL}/api/auth/callback/discord?code=c&state=${state}`,
          { headers: { cookie } },
        ),
      );
    } finally {
      spy.mockRestore();
    }
  }

  const usernameOf = async (discordId: string) =>
    (
      await client.query<{ username: string | null }>(
        `SELECT u.username FROM "user" u JOIN account a ON a.user_id = u.id
         WHERE a.account_id = $1`,
        [discordId],
      )
    ).rows[0]?.username;

  it("persists the Discord username on first sign-in and refreshes it later", async () => {
    await signIn({ id: ALEX, username: "alex_old" });
    expect(await usernameOf(ALEX)).toBe("alex_old");

    await signIn({ id: ALEX, username: "alex_new" });
    expect(await usernameOf(ALEX)).toBe("alex_new");
  });
});
