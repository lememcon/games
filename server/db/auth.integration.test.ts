import { createHmac } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
