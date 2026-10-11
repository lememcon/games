import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PROTECTED_ADMIN_IDS } from "../roles";
import * as schema from "./schema";
import { addLogin, applyMigrations, createTestDb } from "./testDb";
import { createUserStore, lockQuery } from "./userStore";

const [KELSIN, WAYMOST] = PROTECTED_ADMIN_IDS;
const ALEX = "998877665544332211";
const JO = "777666555444333222";
const SAM = "123456789012345678";

describe("migrations", () => {
  it("apply with the drizzle migrator and seed exactly the built-in admins", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    const rows = await db.select().from(schema.appUser);
    expect(rows.map((r) => [r.discordId, r.role, r.status]).sort()).toEqual(
      [
        [KELSIN, "admin", "approved"],
        [WAYMOST, "admin", "approved"],
      ].sort(),
    );
    await client.close();
  });

  it("leaves existing accounts pending, not approved", async () => {
    const client = new PGlite();
    await applyMigrations(client, 0, 1);
    await client.exec(`
      INSERT INTO "user" (id, name, email) VALUES ('old', 'Alex', 'a@discord.invalid');
      INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
        VALUES ('olda', '${ALEX}', 'discord', 'old', now());`);
    await applyMigrations(client, 1);
    const { rows } = await client.query("SELECT discord_id FROM app_user");
    expect(rows).toHaveLength(2);
    const store = createUserStore(drizzle(client, { schema }));
    expect(await store.getOrCreate(ALEX)).toEqual({
      role: "member",
      status: "pending",
      displayName: null,
      color: null,
    });
    await client.close();
  });
});

describe("user store", () => {
  let client: PGlite;
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];
  let store: ReturnType<typeof createUserStore>;

  beforeAll(async () => {
    ({ client, db } = await createTestDb());
    store = createUserStore(db);
  });
  afterAll(() => client.close());
  beforeEach(async () => {
    await client.exec(
      `DELETE FROM session; DELETE FROM account; DELETE FROM "user";
       DELETE FROM app_user WHERE discord_id NOT IN ('${KELSIN}', '${WAYMOST}');
       UPDATE app_user SET role = 'admin', status = 'approved';`,
    );
  });

  const rowOf = async (id: string) =>
    (
      await db
        .select()
        .from(schema.appUser)
        .where(eq(schema.appUser.discordId, id))
    )[0];
  const setRow = (id: string, role: string, status: string) =>
    client.query(
      "INSERT INTO app_user (discord_id, role, status) VALUES ($1, $2, $3) ON CONFLICT (discord_id) DO UPDATE SET role = $2, status = $3",
      [id, role, status],
    );

  describe("constraints", () => {
    it("rejects duplicate (provider_id, account_id) and (user_id, provider_id)", async () => {
      const u = await addLogin(client, ALEX);
      const insert = (id: string, accountId: string, userId: string) =>
        client.query(
          `INSERT INTO account (id, account_id, provider_id, user_id, updated_at) VALUES ($1, $2, 'discord', $3, now())`,
          [id, accountId, userId],
        );
      const other = await addLogin(client, JO);
      await expect(insert("x1", ALEX, other)).rejects.toThrow(/unique/);
      await expect(insert("x2", SAM, u)).rejects.toThrow(/unique/);
    });

    it("rejects unknown roles and statuses", async () => {
      await expect(setRow(SAM, "owner", "pending")).rejects.toThrow(/check/);
      await expect(setRow(SAM, "member", "banned")).rejects.toThrow(/check/);
    });
  });

  describe("discordIds", () => {
    it("returns the linked Discord ids", async () => {
      const u = await addLogin(client, ALEX);
      expect(await store.discordIds(u)).toEqual([ALEX]);
      expect(await store.discordIds("nobody")).toEqual([]);
    });
  });

  describe("getOrCreate", () => {
    it("creates a pending member and never resets an existing row", async () => {
      expect(await store.getOrCreate(SAM)).toEqual({
        role: "member",
        status: "pending",
        displayName: null,
        color: null,
      });
      await setRow(SAM, "member", "approved");
      expect(await store.getOrCreate(SAM)).toEqual({
        role: "member",
        status: "approved",
        displayName: null,
        color: null,
      });
    });

    it("survives concurrent first logins", async () => {
      const rows = await Promise.all([
        store.getOrCreate(SAM),
        store.getOrCreate(SAM),
      ]);
      expect(rows[0]).toEqual(rows[1]);
    });
  });

  describe("repairProtected", () => {
    it("restores a tampered or missing built-in row", async () => {
      await setRow(KELSIN, "member", "pending");
      await store.repairProtected(KELSIN);
      expect(await rowOf(KELSIN)).toMatchObject({
        role: "admin",
        status: "approved",
      });

      await client.query("DELETE FROM app_user WHERE discord_id = $1", [
        WAYMOST,
      ]);
      await store.repairProtected(WAYMOST);
      expect(await rowOf(WAYMOST)).toMatchObject({
        role: "admin",
        status: "approved",
      });
    });

    it("does not write when the row already matches", async () => {
      await client.exec(
        `CREATE OR REPLACE FUNCTION fail_write() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'unexpected write'; END $$ LANGUAGE plpgsql;
         CREATE TRIGGER no_write BEFORE UPDATE ON app_user FOR EACH ROW EXECUTE FUNCTION fail_write();`,
      );
      try {
        await store.repairProtected(KELSIN);
      } finally {
        await client.exec("DROP TRIGGER no_write ON app_user");
      }
    });

    it("ignores ids that are not built in", async () => {
      await store.repairProtected(ALEX);
      expect(await rowOf(ALEX)).toBeUndefined();
    });
  });

  describe("list", () => {
    it("joins profile data, leaving it null for never-signed-in rows", async () => {
      await addLogin(client, ALEX, "Alex");
      await store.getOrCreate(ALEX);
      const users = await store.list();
      expect(users.find((u) => u.discordId === ALEX)).toMatchObject({
        name: "Alex",
        username: "Alex_handle",
        status: "pending",
      });
      expect(users.find((u) => u.discordId === KELSIN)).toMatchObject({
        name: null,
        image: null,
      });
    });
  });

  describe("update", () => {
    it("approves a pending user and promotes them", async () => {
      await addLogin(client, ALEX, "Alex");
      await store.getOrCreate(ALEX);
      const approved = await store.update(KELSIN, ALEX, { status: "approved" });
      expect(approved).toMatchObject({
        ok: true,
        value: { discordId: ALEX, status: "approved", name: "Alex" },
      });
      const promoted = await store.update(KELSIN, ALEX, { role: "admin" });
      expect(promoted).toMatchObject({ ok: true, value: { role: "admin" } });
    });

    it("refuses invalid changes without writing", async () => {
      await store.getOrCreate(ALEX);
      expect(await store.update(KELSIN, ALEX, { role: "admin" })).toMatchObject(
        { status: 400 },
      );
      expect(
        await store.update(KELSIN, KELSIN, { role: "member" }),
      ).toMatchObject({ status: 409 });
      expect(await store.update(KELSIN, SAM, { role: "member" })).toMatchObject(
        { status: 404 },
      );
      expect(await rowOf(ALEX)).toMatchObject({
        role: "member",
        status: "pending",
      });
    });

    it("refuses a non-admin actor", async () => {
      await setRow(ALEX, "member", "approved");
      await store.getOrCreate(JO);
      expect(
        await store.update(ALEX, JO, { status: "approved" }),
      ).toMatchObject({ status: 403 });
    });

    // PGlite runs one transaction at a time, so this checks the actor is
    // re-validated against current state, not that row locks work.
    it("rejects an actor who was demoted by an earlier mutation", async () => {
      await setRow(ALEX, "admin", "approved");
      await setRow(JO, "admin", "approved");
      const results = await Promise.all([
        store.update(ALEX, JO, { role: "member" }),
        store.update(JO, ALEX, { role: "member" }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toMatchObject({ status: 403 });
      const roles = [(await rowOf(ALEX)).role, (await rowOf(JO)).role].sort();
      expect(roles).toEqual(["admin", "member"]);
    });
  });

  describe("lockQuery", () => {
    it("locks actor and target rows FOR UPDATE in discord_id order", () => {
      const { sql, params } = lockQuery(db, JO, ALEX).toSQL();
      expect(sql).toMatch(/order by "app_user"\."discord_id" for update$/);
      expect(params).toEqual([JO, ALEX]);
    });
  });

  describe("remove", () => {
    it("deletes the sessions and the row together", async () => {
      await addLogin(client, ALEX);
      await store.getOrCreate(ALEX);
      const bystander = await addLogin(client, JO);
      expect(await store.remove(KELSIN, ALEX)).toEqual({
        ok: true,
        value: null,
      });
      expect(await rowOf(ALEX)).toBeUndefined();
      const { rows } = await client.query<{ user_id: string }>(
        "SELECT user_id FROM session",
      );
      expect(rows).toEqual([{ user_id: bystander }]);
    });

    it("lets a later login start over as pending", async () => {
      await store.getOrCreate(ALEX);
      await store.update(KELSIN, ALEX, { status: "approved" });
      await store.remove(KELSIN, ALEX);
      expect(await store.getOrCreate(ALEX)).toEqual({
        role: "member",
        status: "pending",
        displayName: null,
        color: null,
      });
    });

    it("refuses built-ins, missing targets and removed actors", async () => {
      expect(await store.remove(KELSIN, WAYMOST)).toMatchObject({
        status: 409,
      });
      expect(await store.remove(KELSIN, SAM)).toMatchObject({ status: 404 });
      await store.getOrCreate(ALEX);
      expect(await store.remove(ALEX, KELSIN)).toMatchObject({ status: 403 });
      expect(await rowOf(WAYMOST)).toBeDefined();
    });
  });
});
