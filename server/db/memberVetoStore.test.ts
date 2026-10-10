import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMemberVetoStore } from "./memberVetoStore";
import { applyMigrations, createTestDb } from "./testDb";
import { createUserStore } from "./userStore";

const ALEX = "998877665544332211";
const JO = "777666555444333222";

let client: PGlite;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let store: ReturnType<typeof createMemberVetoStore>;

const rows = async () =>
  (
    await client.query(
      "SELECT discord_id, bgg_id FROM member_veto ORDER BY discord_id, bgg_id",
    )
  ).rows;

beforeAll(async () => {
  ({ client, db } = await createTestDb());
  store = createMemberVetoStore(db);
});
afterAll(() => client.close());

beforeEach(async () => {
  await client.exec(
    `DELETE FROM member_veto; DELETE FROM year; DELETE FROM game; DELETE FROM app_user;
     INSERT INTO year (year) VALUES (2025), (2026);
     INSERT INTO game (bgg_id, name) VALUES (1, 'Root'), (2, 'Azul'), (3, NULL);`,
  );
  const users = createUserStore(db);
  for (const id of [ALEX, JO]) await users.getOrCreate(id);
});

describe("set", () => {
  it("stores a veto, idempotently", async () => {
    expect(await store.set(ALEX, 1)).toEqual({ ok: true, value: null });
    expect(await store.set(ALEX, 1)).toEqual({ ok: true, value: null });
    expect(await rows()).toEqual([{ discord_id: ALEX, bgg_id: 1 }]);
  });

  it("refuses an unknown game", async () => {
    expect(await store.set(ALEX, 99)).toMatchObject({
      status: 404,
      error: "unknown_game",
    });
    expect(await rows()).toEqual([]);
  });
});

describe("getAll", () => {
  it("lists every member's vetoes", async () => {
    await store.set(ALEX, 1);
    await store.set(JO, 2);
    await store.set(ALEX, 2);
    const all = await store.getAll();
    expect(all).toHaveLength(3);
    expect(all).toEqual(
      expect.arrayContaining([
        { discordId: ALEX, bggId: 1 },
        { discordId: ALEX, bggId: 2 },
        { discordId: JO, bggId: 2 },
      ]),
    );
  });

  it("is empty without vetoes", async () => {
    expect(await store.getAll()).toEqual([]);
  });
});

describe("listMine", () => {
  it("lists only the member's vetoes by name, unnamed last", async () => {
    await store.set(ALEX, 3);
    await store.set(ALEX, 1);
    await store.set(ALEX, 2);
    await store.set(JO, 2);
    expect(await store.listMine(ALEX)).toEqual([
      { bggId: 2, name: "Azul" },
      { bggId: 1, name: "Root" },
      { bggId: 3, name: null },
    ]);
  });
});

describe("clear", () => {
  it("removes only that member's row for that game", async () => {
    await store.set(ALEX, 1);
    await store.set(ALEX, 2);
    await store.set(JO, 1);
    await store.clear(ALEX, 1);
    await store.clear(ALEX, 1);
    expect(await rows()).toEqual([
      { discord_id: JO, bgg_id: 1 },
      { discord_id: ALEX, bgg_id: 2 },
    ]);
  });
});

describe("cascades", () => {
  it("removes vetoes with their member and game, not with a year", async () => {
    await store.set(ALEX, 1);
    await store.set(JO, 2);
    await store.set(JO, 1);
    await client.exec("DELETE FROM app_user WHERE discord_id = '" + ALEX + "'");
    expect(await rows()).toHaveLength(2);
    await client.exec("DELETE FROM year WHERE year = 2026");
    expect(await rows()).toHaveLength(2);
    await client.exec("DELETE FROM game WHERE bgg_id = 2");
    expect(await rows()).toEqual([{ discord_id: JO, bgg_id: 1 }]);
  });
});

describe("dropping the veto year (migration 0014)", () => {
  it("merges per-year vetoes into one row per member and game", async () => {
    const pre = new PGlite();
    await applyMigrations(pre, 0, 14);
    await pre.exec(
      `INSERT INTO app_user (discord_id) VALUES ('${ALEX}'), ('${JO}');
       INSERT INTO year (year) VALUES (2025), (2026), (2027);
       INSERT INTO game (bgg_id, name) VALUES (1, 'Root'), (2, 'Azul');
       INSERT INTO member_veto (discord_id, year, bgg_id) VALUES
         ('${ALEX}', 2025, 1), ('${ALEX}', 2026, 1), ('${ALEX}', 2027, 1),
         ('${JO}', 2026, 1);`,
    );
    await applyMigrations(pre, 14);
    const { rows: merged } = await pre.query(
      "SELECT * FROM member_veto ORDER BY discord_id, bgg_id",
    );
    expect(merged).toEqual([
      { discord_id: JO, bgg_id: 1 },
      { discord_id: ALEX, bgg_id: 1 },
    ]);
    const { rows: yearColumn } = await pre.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'member_veto' AND column_name = 'year'",
    );
    expect(yearColumn).toEqual([]);
    await expect(
      pre.exec(
        `INSERT INTO member_veto (discord_id, bgg_id) VALUES ('${ALEX}', 1)`,
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await pre.exec("DELETE FROM year WHERE year = 2025");
    const { rows: kept } = await pre.query(
      "SELECT count(*)::int AS n FROM member_veto",
    );
    expect(kept).toEqual([{ n: 2 }]);
    await pre.close();
  });
});
