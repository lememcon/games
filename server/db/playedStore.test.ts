import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPlayedStore } from "./playedStore";
import { createTestDb } from "./testDb";
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
    `DELETE FROM played_count; DELETE FROM year; DELETE FROM app_user;
     INSERT INTO year (year) VALUES (2025), (2026);`,
  );
  const users = createUserStore(db);
  for (const id of [ALEX, JO]) await users.getOrCreate(id);
});

describe("get", () => {
  it("is empty for a member with no counts and null for an unknown year", async () => {
    expect(await store.get(ALEX, 2025)).toEqual({});
    expect(await store.get(ALEX, 1999)).toBeNull();
  });
});

describe("getAll", () => {
  it("groups every member's counts for the year, leaving out games reset to zero", async () => {
    await store.set(ALEX, 2025, 11, 2);
    await store.set(ALEX, 2025, 12, 1);
    await store.set(JO, 2025, 11, 4);
    await store.set(JO, 2026, 13, 7);
    await store.set(JO, 2025, 99, 3);
    await store.set(JO, 2025, 99, 0);
    expect(await store.getAll(2025)).toEqual({
      [ALEX]: { "11": 2, "12": 1 },
      [JO]: { "11": 4 },
    });
    expect(await store.getAll(2026)).toEqual({ [JO]: { "13": 7 } });
  });

  it("is empty for a year with no plays and null for an unknown year", async () => {
    expect(await store.getAll(2025)).toEqual({});
    expect(await store.getAll(1999)).toBeNull();
  });
});

describe("set", () => {
  it("inserts, updates and deletes at zero", async () => {
    expect(await store.set(ALEX, 2025, 11, 2)).toEqual({
      ok: true,
      value: null,
    });
    expect(await store.get(ALEX, 2025)).toEqual({ "11": 2 });
    await store.set(ALEX, 2025, 11, 5);
    expect(await store.get(ALEX, 2025)).toEqual({ "11": 5 });
    await store.set(ALEX, 2025, 11, 0);
    expect(await store.get(ALEX, 2025)).toEqual({});
    expect(await rowCount()).toBe(0);
  });

  it("treats zero for a game with no row as a no-op", async () => {
    expect((await store.set(ALEX, 2025, 11, 0)).ok).toBe(true);
    expect(await rowCount()).toBe(0);
  });

  it("keeps members and years apart", async () => {
    await store.set(ALEX, 2025, 11, 1);
    await store.set(JO, 2025, 11, 3);
    await store.set(ALEX, 2026, 11, 7);
    expect(await store.get(ALEX, 2025)).toEqual({ "11": 1 });
    expect(await store.get(JO, 2025)).toEqual({ "11": 3 });
    expect(await store.get(ALEX, 2026)).toEqual({ "11": 7 });
  });

  it("refuses an unknown year", async () => {
    expect(await store.set(ALEX, 1999, 11, 1)).toEqual({
      ok: false,
      status: 404,
      error: "unknown_year",
    });
    expect(await rowCount()).toBe(0);
  });

  it("enforces the count range in the database", async () => {
    await expect(store.set(ALEX, 2025, 11, 1000)).rejects.toThrow();
  });
});

describe("importCounts", () => {
  it("fills missing games only, keeping stored counts", async () => {
    await store.set(ALEX, 2025, 11, 2);
    const result = await store.importCounts(
      ALEX,
      2025,
      new Map([
        [11, 9],
        [12, 4],
      ]),
    );
    expect(result).toEqual({ ok: true, value: { "11": 2, "12": 4 } });
  });

  it("returns the existing counts for an empty import", async () => {
    await store.set(ALEX, 2025, 11, 2);
    expect(await store.importCounts(ALEX, 2025, new Map())).toEqual({
      ok: true,
      value: { "11": 2 },
    });
  });

  it("does not touch other members or years", async () => {
    await store.set(JO, 2025, 11, 3);
    await store.importCounts(ALEX, 2025, new Map([[11, 1]]));
    expect(await store.get(JO, 2025)).toEqual({ "11": 3 });
    expect(await store.get(ALEX, 2026)).toEqual({});
  });

  it("refuses an unknown year", async () => {
    expect(await store.importCounts(ALEX, 1999, new Map([[11, 1]]))).toEqual({
      ok: false,
      status: 404,
      error: "unknown_year",
    });
  });
});

describe("cascades", () => {
  it("removes a member's counts when the member is deleted", async () => {
    await store.set(ALEX, 2025, 11, 1);
    await store.set(JO, 2025, 11, 1);
    await client.query("DELETE FROM app_user WHERE discord_id = $1", [ALEX]);
    expect(await rowCount()).toBe(1);
    expect(await store.get(JO, 2025)).toEqual({ "11": 1 });
  });

  it("removes counts when the year is deleted", async () => {
    await store.set(ALEX, 2025, 11, 1);
    await store.set(ALEX, 2026, 11, 1);
    await client.query("DELETE FROM year WHERE year = 2025");
    expect(await rowCount()).toBe(1);
  });
});
