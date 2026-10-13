import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPlayedStore } from "./playedStore";
import { applyMigrations, createTestDb } from "./testDb";
import { createUserStore } from "./userStore";

const ALEX = "998877665544332211";
const JO = "777666555444333222";

let client: PGlite;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let store: ReturnType<typeof createPlayedStore>;

const rowCount = async () =>
  (
    await client.query<{ n: number }>(
      "SELECT count(*)::int n FROM played_count",
    )
  ).rows[0].n;

beforeAll(async () => {
  ({ client, db } = await createTestDb());
  store = createPlayedStore(db);
});
afterAll(() => client.close());

beforeEach(async () => {
  await client.exec(
    `DELETE FROM played_count; DELETE FROM year; DELETE FROM app_user; DELETE FROM game;
     INSERT INTO year (year) VALUES (2025), (2026);
     INSERT INTO game (bgg_id) VALUES (11), (12), (13), (30), (99), (200);`,
  );
  const users = createUserStore(db);
  for (const id of [ALEX, JO]) await users.getOrCreate(id);
});

const insert = (
  discordId: string,
  year: number,
  bggId: number,
  count: number,
) =>
  client.query(
    "INSERT INTO played_count (discord_id, year, bgg_id, count) VALUES ($1, $2, $3, $4)",
    [discordId, year, bggId, count],
  );

describe("get", () => {
  it("is empty for a member with nothing played and null for an unknown year", async () => {
    expect(await store.get(ALEX, 2025)).toEqual([]);
    expect(await store.get(ALEX, 1999)).toBeNull();
  });

  it("lists played ids in ascending order", async () => {
    await store.set(ALEX, 2025, 200, true);
    await store.set(ALEX, 2025, 11, true);
    await store.set(ALEX, 2025, 30, true);
    expect(await store.get(ALEX, 2025)).toEqual(["11", "30", "200"]);
  });

  it("reads a row with a legacy count above 1 as played", async () => {
    await insert(ALEX, 2025, 11, 5);
    expect(await store.get(ALEX, 2025)).toEqual(["11"]);
    expect(await store.getAll(2025)).toEqual({ [ALEX]: ["11"] });
  });
});

describe("getAll", () => {
  it("groups every member's played games for the year, leaving out unplayed ones", async () => {
    await store.set(ALEX, 2025, 12, true);
    await store.set(ALEX, 2025, 11, true);
    await store.set(JO, 2025, 11, true);
    await store.set(JO, 2026, 13, true);
    await store.set(JO, 2025, 99, true);
    await store.set(JO, 2025, 99, false);
    expect(await store.getAll(2025)).toEqual({
      [ALEX]: ["11", "12"],
      [JO]: ["11"],
    });
    expect(await store.getAll(2026)).toEqual({ [JO]: ["13"] });
  });

  it("is empty for a year with no plays and null for an unknown year", async () => {
    expect(await store.getAll(2025)).toEqual({});
    expect(await store.getAll(1999)).toBeNull();
  });
});

describe("set", () => {
  it("marks played with count 1, idempotently", async () => {
    expect(await store.set(ALEX, 2025, 11, true)).toEqual({
      ok: true,
      value: null,
    });
    expect(await store.set(ALEX, 2025, 11, true)).toEqual({
      ok: true,
      value: null,
    });
    expect(
      (await client.query("SELECT bgg_id, count FROM played_count")).rows,
    ).toEqual([{ bgg_id: 11, count: 1 }]);
  });

  it("leaves an existing legacy count alone when marking played", async () => {
    await insert(ALEX, 2025, 11, 5);
    await store.set(ALEX, 2025, 11, true);
    expect((await client.query("SELECT count FROM played_count")).rows).toEqual(
      [{ count: 5 }],
    );
  });

  it("deletes the row when unplayed, idempotently", async () => {
    await store.set(ALEX, 2025, 11, true);
    expect((await store.set(ALEX, 2025, 11, false)).ok).toBe(true);
    expect((await store.set(ALEX, 2025, 11, false)).ok).toBe(true);
    expect(await store.get(ALEX, 2025)).toEqual([]);
    expect(await rowCount()).toBe(0);
  });

  it("refuses an unknown game, writes nothing, and still unmarks it", async () => {
    expect(await store.set(ALEX, 2025, 4040, true)).toEqual({
      ok: false,
      status: 404,
      error: "unknown_game",
    });
    expect(await rowCount()).toBe(0);
    await insert(ALEX, 2025, 4040, 1);
    expect((await store.set(ALEX, 2025, 4040, false)).ok).toBe(true);
    expect(await rowCount()).toBe(0);
  });

  it("keeps members and years apart", async () => {
    await store.set(ALEX, 2025, 11, true);
    await store.set(JO, 2025, 12, true);
    await store.set(ALEX, 2026, 13, true);
    expect(await store.get(ALEX, 2025)).toEqual(["11"]);
    expect(await store.get(JO, 2025)).toEqual(["12"]);
    expect(await store.get(ALEX, 2026)).toEqual(["13"]);
  });

  it("refuses an unknown year", async () => {
    expect(await store.set(ALEX, 1999, 11, true)).toEqual({
      ok: false,
      status: 404,
      error: "unknown_year",
    });
    expect(await rowCount()).toBe(0);
  });
});

describe("importPlayed", () => {
  it("adds missing games with count 1, keeping stored rows", async () => {
    await insert(ALEX, 2025, 11, 2);
    const result = await store.importPlayed(ALEX, 2025, new Set([11, 12]));
    expect(result).toEqual({ ok: true, value: ["11", "12"] });
    expect(
      (
        await client.query(
          "SELECT bgg_id, count FROM played_count ORDER BY bgg_id",
        )
      ).rows,
    ).toEqual([
      { bgg_id: 11, count: 2 },
      { bgg_id: 12, count: 1 },
    ]);
  });

  it("returns the existing played games for an empty import", async () => {
    await store.set(ALEX, 2025, 11, true);
    expect(await store.importPlayed(ALEX, 2025, new Set())).toEqual({
      ok: true,
      value: ["11"],
    });
  });

  it("does not touch other members or years", async () => {
    await store.set(JO, 2025, 11, true);
    await store.importPlayed(ALEX, 2025, new Set([12]));
    expect(await store.get(JO, 2025)).toEqual(["11"]);
    expect(await store.get(ALEX, 2026)).toEqual([]);
  });

  it("refuses an unknown year", async () => {
    expect(await store.importPlayed(ALEX, 1999, new Set([11]))).toEqual({
      ok: false,
      status: 404,
      error: "unknown_year",
    });
  });
});

describe("cascades", () => {
  it("removes a member's played games when the member is deleted", async () => {
    await store.set(ALEX, 2025, 11, true);
    await store.set(JO, 2025, 11, true);
    await client.query("DELETE FROM app_user WHERE discord_id = $1", [ALEX]);
    expect(await rowCount()).toBe(1);
    expect(await store.get(JO, 2025)).toEqual(["11"]);
  });

  it("removes played games when the year is deleted", async () => {
    await store.set(ALEX, 2025, 11, true);
    await store.set(ALEX, 2026, 11, true);
    await client.query("DELETE FROM year WHERE year = 2025");
    expect(await rowCount()).toBe(1);
  });
});

describe("collapsing counts to played (migration 0016)", () => {
  it("sets every count to 1 and still accepts old-release writes", async () => {
    const pre = new PGlite();
    await applyMigrations(pre, 0, 16);
    await pre.exec(
      `INSERT INTO app_user (discord_id) VALUES ('${ALEX}'), ('${JO}');
       INSERT INTO year (year) VALUES (2025), (2026);
       INSERT INTO game (bgg_id, name) VALUES (1, 'Root'), (2, 'Azul');
       INSERT INTO played_count (discord_id, year, bgg_id, count) VALUES
         ('${ALEX}', 2025, 1, 1), ('${ALEX}', 2025, 2, 3),
         ('${ALEX}', 2026, 1, 999), ('${JO}', 2025, 1, 3);`,
    );
    await applyMigrations(pre, 16);
    const { rows: collapsed } = await pre.query(
      "SELECT discord_id, year, bgg_id, count FROM played_count ORDER BY discord_id, year, bgg_id",
    );
    expect(collapsed).toEqual([
      { discord_id: JO, year: 2025, bgg_id: 1, count: 1 },
      { discord_id: ALEX, year: 2025, bgg_id: 1, count: 1 },
      { discord_id: ALEX, year: 2025, bgg_id: 2, count: 1 },
      { discord_id: ALEX, year: 2026, bgg_id: 1, count: 1 },
    ]);
    await pre.exec(
      `INSERT INTO played_count (discord_id, year, bgg_id, count)
       VALUES ('${JO}', 2026, 2, 2)`,
    );
    await expect(
      pre.exec(
        `INSERT INTO played_count (discord_id, year, bgg_id, count)
         VALUES ('${JO}', 2026, 1, 0)`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await pre.close();
  });
});

describe("markPlayed", () => {
  const approve = (...ids: string[]) =>
    client.query(
      "UPDATE app_user SET status = 'approved' WHERE discord_id = ANY($1)",
      [ids],
    );

  it("marks every member, keeps existing rows and other games and years", async () => {
    await approve(ALEX, JO);
    await insert(ALEX, 2025, 11, 3);
    await insert(JO, 2026, 12, 1);
    const result = await store.markPlayed(new Set([ALEX, JO]), 2025, 11);
    expect(result).toEqual({
      ok: true,
      value: { [ALEX]: ["11"], [JO]: ["11"] },
    });
    expect(await rowCount()).toBe(3);
    const { rows } = await client.query<{ count: number }>(
      "SELECT count FROM played_count WHERE discord_id = $1 AND year = 2025",
      [ALEX],
    );
    expect(rows).toEqual([{ count: 3 }]);
    expect(await store.get(JO, 2026)).toEqual(["12"]);
  });

  it("refuses an unknown year", async () => {
    await approve(ALEX);
    expect(await store.markPlayed(new Set([ALEX]), 1999, 11)).toMatchObject({
      ok: false,
      error: "unknown_year",
    });
    expect(await rowCount()).toBe(0);
  });

  it("refuses an unknown game and writes nothing", async () => {
    await approve(ALEX, JO);
    expect(
      await store.markPlayed(new Set([ALEX, JO]), 2025, 4040),
    ).toMatchObject({ ok: false, status: 404, error: "unknown_game" });
    expect(await rowCount()).toBe(0);
  });

  it("refuses and writes nothing when any id is pending or unknown", async () => {
    await approve(ALEX);
    for (const other of [JO, "111111111111111111"])
      expect(
        await store.markPlayed(new Set([ALEX, other]), 2025, 11),
      ).toMatchObject({ ok: false, status: 422, error: "unknown_member" });
    expect(await rowCount()).toBe(0);
  });
});
