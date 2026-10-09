import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { parseImport } from "../import";
import { createDataStore } from "./dataStore";
import { createLinkStore } from "./linkStore";
import { appUser, player } from "./schema";
import { addLogin, createTestDb } from "./testDb";
import { createUserStore } from "./userStore";

const ALEX = "998877665544332211";
const JO = "777666555444333222";

let client: PGlite;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let store: ReturnType<typeof createLinkStore>;

const importScores = async (year: number, players: string[]) => {
  const parsed = parseImport({
    year,
    player_game_scores: players.map((p, i) => ({
      bgg_id: 1,
      game: "Root",
      player: p,
      score: 10 - i,
      rank: i + 1,
    })),
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  const result = await createDataStore(db).importData(parsed.value, {
    importedBy: "1",
    sourceFilename: null,
  });
  expect(result.ok).toBe(true);
};
const playerRows = async () =>
  (await client.query("SELECT id, name, discord_id FROM player ORDER BY id"))
    .rows as { id: number; name: string; discord_id: string | null }[];
const idOf = async (name: string) =>
  (await playerRows()).find((p) => p.name === name)!.id;

beforeAll(async () => {
  ({ client, db } = await createTestDb());
  store = createLinkStore(db);
});
afterAll(() => client.close());

beforeEach(async () => {
  await client.exec(`
    DELETE FROM score; DELETE FROM player; DELETE FROM year;
    DELETE FROM session; DELETE FROM account; DELETE FROM "user";
    DELETE FROM app_user;`);
});

describe("list", () => {
  it("returns score counts, zero-score players, names and the right order", async () => {
    await importScores(2026, ["zed", "Bob", "amy"]);
    await client.exec(`INSERT INTO player (name) VALUES ('idle')`);
    await createUserStore(db).getOrCreate(ALEX);
    await addLogin(client, ALEX, "Alex");
    await store.setLink(await idOf("zed"), ALEX);

    const { players } = await store.list();
    expect(players.map((p) => p.name)).toEqual(["amy", "Bob", "idle", "zed"]);
    expect(players.map((p) => p.scoreCount)).toEqual([1, 1, 0, 1]);
    expect(players.map((p) => p.discordId)).toEqual([null, null, null, ALEX]);
    expect(players[3].userName).toBe("Alex");
    expect(players[0].userName).toBeNull();
  });

  it("counts several scores once per score, not per join row", async () => {
    await importScores(2025, ["amy"]);
    await importScores(2026, ["amy"]);
    await createUserStore(db).getOrCreate(ALEX);
    await addLogin(client, ALEX, "Alex");
    await store.setLink(await idOf("amy"), ALEX);
    const { players } = await store.list();
    expect(players).toHaveLength(1);
    expect(players[0].scoreCount).toBe(2);
  });

  it("lists members with a Discord login, with status, and omits others", async () => {
    const users = createUserStore(db);
    await users.getOrCreate(ALEX);
    await users.getOrCreate(JO);
    await users.getOrCreate("555555555555555555"); // no login
    await addLogin(client, ALEX, "Alex");
    await addLogin(client, JO, "jo");
    await db
      .update(appUser)
      .set({ status: "approved" })
      .where(eq(appUser.discordId, ALEX));

    const { users: members } = await store.list();
    expect(members).toEqual([
      { discordId: ALEX, name: "Alex", status: "approved" },
      { discordId: JO, name: "jo", status: "pending" },
    ]);
  });
});

describe("setLink", () => {
  beforeEach(async () => {
    await importScores(2026, ["amy", "bob"]);
    const users = createUserStore(db);
    await users.getOrCreate(ALEX);
    await users.getOrCreate(JO);
  });

  it("links, re-links and unlinks", async () => {
    const id = await idOf("amy");
    expect(await store.setLink(id, ALEX)).toEqual({ ok: true, value: null });
    expect((await playerRows())[0].discord_id).toBe(ALEX);
    await store.setLink(id, JO);
    expect((await playerRows())[0].discord_id).toBe(JO);
    expect((await store.setLink(id, null)).ok).toBe(true);
    expect((await store.setLink(id, null)).ok).toBe(true);
    expect((await playerRows())[0].discord_id).toBeNull();
  });

  it("allows two players to link to one member", async () => {
    await store.setLink(await idOf("amy"), ALEX);
    expect((await store.setLink(await idOf("bob"), ALEX)).ok).toBe(true);
  });

  it("refuses an unknown player or member", async () => {
    expect(await store.setLink(9999, ALEX)).toEqual({
      ok: false,
      status: 404,
      error: "unknown_player",
    });
    expect(await store.setLink(await idOf("amy"), "424242")).toEqual({
      ok: false,
      status: 404,
      error: "unknown_user",
    });
    expect((await playerRows())[0].discord_id).toBeNull();
  });

  it("clears links but keeps the player and scores when the member is deleted", async () => {
    const id = await idOf("amy");
    await store.setLink(id, ALEX);
    await db.delete(appUser).where(eq(appUser.discordId, ALEX));

    const rows = await db.select().from(player).where(eq(player.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].discordId).toBeNull();
    const { rows: scores } = await client.query(
      "SELECT 1 FROM score WHERE player_id = $1",
      [id],
    );
    expect(scores).toHaveLength(1);
  });
});

describe("importing after linking", () => {
  it("keeps a link when the same name arrives in another case, and adds new names unlinked", async () => {
    await importScores(2025, ["bob"]);
    await createUserStore(db).getOrCreate(ALEX);
    const id = await idOf("bob");
    await store.setLink(id, ALEX);

    await importScores(2026, ["BOB", "carol"]);

    const rows = await playerRows();
    expect(rows.map((r) => r.name)).toEqual(["bob", "carol"]);
    expect(rows[0]).toMatchObject({ id, discord_id: ALEX });
    expect(rows[1].discord_id).toBeNull();
  });
});
