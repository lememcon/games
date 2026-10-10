import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMemberVetoStore } from "./memberVetoStore";
import { createTestDb } from "./testDb";
import { createUserStore } from "./userStore";

const ALEX = "998877665544332211";
const JO = "777666555444333222";

let client: PGlite;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let store: ReturnType<typeof createMemberVetoStore>;

const rows = async () =>
  (
    await client.query(
      "SELECT discord_id, year, bgg_id FROM member_veto ORDER BY discord_id, year, bgg_id",
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
    expect(await store.set(ALEX, 2025, 1)).toEqual({ ok: true, value: null });
    expect(await store.set(ALEX, 2025, 1)).toEqual({ ok: true, value: null });
    expect(await rows()).toEqual([{ discord_id: ALEX, year: 2025, bgg_id: 1 }]);
  });

  it("refuses an unknown year or game", async () => {
    expect(await store.set(ALEX, 1999, 1)).toMatchObject({
      status: 404,
      error: "unknown_year",
    });
    expect(await store.set(ALEX, 2025, 99)).toMatchObject({
      status: 404,
      error: "unknown_game",
    });
    expect(await rows()).toEqual([]);
  });
});

describe("getAll", () => {
  it("lists every member's vetoes for the year and null for an unknown year", async () => {
    await store.set(ALEX, 2025, 1);
    await store.set(JO, 2025, 2);
    await store.set(ALEX, 2026, 2);
    const all = await store.getAll(2025);
    expect(all).toHaveLength(2);
    expect(all).toEqual(
      expect.arrayContaining([
        { discordId: ALEX, bggId: 1 },
        { discordId: JO, bggId: 2 },
      ]),
    );
    expect(await store.getAll(1999)).toBeNull();
  });

  it("is empty for a year without vetoes", async () => {
    expect(await store.getAll(2026)).toEqual([]);
  });
});

describe("listMine", () => {
  it("lists only the member's vetoes, newest year then name, with names", async () => {
    await store.set(ALEX, 2025, 1);
    await store.set(ALEX, 2026, 1);
    await store.set(ALEX, 2026, 2);
    await store.set(ALEX, 2026, 3);
    await store.set(JO, 2026, 2);
    expect(await store.listMine(ALEX)).toEqual([
      { year: 2026, bggId: 2, name: "Azul" },
      { year: 2026, bggId: 1, name: "Root" },
      { year: 2026, bggId: 3, name: null },
      { year: 2025, bggId: 1, name: "Root" },
    ]);
  });
});

describe("clear", () => {
  it("removes only that member's row for that year and game", async () => {
    await store.set(ALEX, 2025, 1);
    await store.set(ALEX, 2026, 1);
    await store.set(ALEX, 2025, 2);
    await store.set(JO, 2025, 1);
    await store.clear(ALEX, 2025, 1);
    await store.clear(ALEX, 2025, 1);
    expect(await rows()).toEqual([
      { discord_id: JO, year: 2025, bgg_id: 1 },
      { discord_id: ALEX, year: 2025, bgg_id: 2 },
      { discord_id: ALEX, year: 2026, bgg_id: 1 },
    ]);
  });
});

describe("cascades", () => {
  it("removes vetoes with their member, year and game", async () => {
    await store.set(ALEX, 2025, 1);
    await store.set(JO, 2025, 2);
    await store.set(JO, 2026, 1);
    await client.exec("DELETE FROM app_user WHERE discord_id = '" + ALEX + "'");
    expect(await rows()).toHaveLength(2);
    await client.exec("DELETE FROM year WHERE year = 2026");
    expect(await rows()).toHaveLength(1);
    await client.exec("DELETE FROM game WHERE bgg_id = 2");
    expect(await rows()).toEqual([]);
  });
});
