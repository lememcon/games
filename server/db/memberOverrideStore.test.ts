import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMemberOverrideStore } from "./memberOverrideStore";
import { applyMigrations, createTestDb } from "./testDb";
import { createUserStore } from "./userStore";

const ALEX = "998877665544332211";
const JO = "777666555444333222";

let client: PGlite;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let store: ReturnType<typeof createMemberOverrideStore>;

const rows = async () =>
  (
    await client.query(
      "SELECT discord_id, bgg_id, min_players, max_players FROM member_player_override ORDER BY discord_id, bgg_id",
    )
  ).rows;

beforeAll(async () => {
  ({ client, db } = await createTestDb());
  store = createMemberOverrideStore(db);
});
afterAll(() => client.close());

beforeEach(async () => {
  await client.exec(
    `DELETE FROM member_player_override;
     DELETE FROM game_metadata; DELETE FROM player; DELETE FROM game; DELETE FROM app_user;
     INSERT INTO game (bgg_id, name) VALUES (1, 'Root'), (2, 'Wide'), (3, 'Bare');
     INSERT INTO game_metadata (bgg_id, min_players, max_players) VALUES (1, 2, 6), (2, 1, 8);`,
  );
  const users = createUserStore(db);
  for (const id of [ALEX, JO]) await users.getOrCreate(id);
  await client.query(
    "INSERT INTO player (name, discord_id) VALUES ('Alex', $1), ('Jo', $2)",
    [ALEX, JO],
  );
});

describe("set", () => {
  it("narrows within BGG's range", async () => {
    expect(await store.set(ALEX, 1, { min: 3, max: 4 })).toEqual({
      ok: true,
      value: null,
    });
    expect(await rows()).toEqual([
      { discord_id: ALEX, bgg_id: 1, min_players: 3, max_players: 4 },
    ]);
  });

  it("refuses widening either side", async () => {
    expect(await store.set(ALEX, 1, { min: 1, max: 4 })).toMatchObject({
      status: 400,
      error: "out_of_range",
    });
    expect(await store.set(ALEX, 1, { min: 2, max: 7 })).toMatchObject({
      error: "out_of_range",
    });
    expect(await rows()).toEqual([]);
  });

  it("stores a range equal to the base", async () => {
    expect((await store.set(ALEX, 1, { min: 2, max: 6 })).ok).toBe(true);
    expect(await rows()).toHaveLength(1);
  });

  it("refuses a member with no linked player", async () => {
    await client.exec("UPDATE player SET discord_id = NULL WHERE name = 'Jo'");
    expect(await store.set(JO, 1, { min: 3, max: 4 })).toMatchObject({
      status: 403,
      error: "not_linked",
    });
  });

  it("refuses an unknown game and a game without a range", async () => {
    expect(await store.set(ALEX, 99, { min: 1, max: 2 })).toMatchObject({
      status: 404,
      error: "unknown_game",
    });
    expect(await store.set(ALEX, 3, { min: 1, max: 2 })).toMatchObject({
      status: 409,
      error: "no_player_range",
    });
  });

  it("replaces the member's earlier range", async () => {
    await store.set(ALEX, 1, { min: 3, max: 4 });
    await store.set(ALEX, 1, { min: 2, max: 5 });
    expect(await rows()).toEqual([
      { discord_id: ALEX, bgg_id: 1, min_players: 2, max_players: 5 },
    ]);
  });
});

describe("getAll", () => {
  it("groups ranges by member then game", async () => {
    expect(await store.getAll()).toEqual({});
    await store.set(ALEX, 1, { min: 3, max: 4 });
    await store.set(ALEX, 2, { min: 4, max: 5 });
    await store.set(JO, 1, { min: 2, max: 2 });
    expect(await store.getAll()).toEqual({
      [ALEX]: { 1: { min: 3, max: 4 }, 2: { min: 4, max: 5 } },
      [JO]: { 1: { min: 2, max: 2 } },
    });
  });
});

describe("clear", () => {
  it("removes only the member's row and is idempotent", async () => {
    await store.set(ALEX, 1, { min: 3, max: 4 });
    await store.set(JO, 1, { min: 2, max: 2 });
    await store.clear(ALEX, 1);
    await store.clear(ALEX, 1);
    expect(await rows()).toEqual([
      { discord_id: JO, bgg_id: 1, min_players: 2, max_players: 2 },
    ]);
  });
});

describe("dropping admin overrides (migration 0012)", () => {
  it("removes game_player_override and keeps member overrides", async () => {
    const pre = new PGlite();
    await applyMigrations(pre, 0, 12);
    await pre.exec(
      `INSERT INTO app_user (discord_id) VALUES ('${ALEX}');
       INSERT INTO game (bgg_id, name) VALUES (1, 'Root');
       INSERT INTO game_player_override (bgg_id, min_players, max_players) VALUES (1, 3, 5);
       INSERT INTO member_player_override (discord_id, bgg_id, min_players, max_players) VALUES ('${ALEX}', 1, 3, 4);`,
    );
    await applyMigrations(pre, 12);
    const { rows } = await pre.query(
      "SELECT to_regclass('game_player_override') AS gone, (SELECT count(*)::int FROM member_player_override) AS kept",
    );
    expect(rows).toEqual([{ gone: null, kept: 1 }]);
    await pre.close();
  });
});
