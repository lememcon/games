import { readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseImport } from "../import";
import type { ImportContext } from "../types";
import { createDataStore } from "./dataStore";
import { addLogin, createTestDb } from "./testDb";

const root = path.resolve(import.meta.dirname, "../..");
const readJson = (file: string) =>
  JSON.parse(readFileSync(path.join(root, file), "utf8"));
const sample = readJson("sample-data.json");
const realGames = readJson("src/assets/games.json");

const context: ImportContext = { importedBy: "1", sourceFilename: "f.json" };

function parsed(raw: unknown) {
  const result = parseImport(raw);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
}
const row = (over: Record<string, unknown> = {}) => ({
  bgg_id: 1,
  game: "Root",
  player: "kelsin",
  score: 10,
  rank: 1,
  ...over,
});
const upload = (year: number, rows: unknown[], extra: object = {}) =>
  parsed({ year, player_game_scores: rows, ...extra });

let client: PGlite;
let store: ReturnType<typeof createDataStore>;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];

beforeAll(async () => {
  ({ client, db } = await createTestDb());
  store = createDataStore(db);
});
afterAll(() => client.close());

describe("data store", () => {
  it("starts with the bundled game metadata and no scores", async () => {
    expect(await store.listYears()).toEqual([]);
    expect(await store.getGames()).toEqual(realGames);
    expect(await store.getScores(2025)).toBeNull();
  });

  it("imports a games-only upload with null names and no year", async () => {
    const result = await store.importData(parsed(realGames), context);
    expect(result).toMatchObject({
      ok: true,
      value: { year: null, scores: 0, games: { new: 191, updated: 0 } },
    });
    expect(await store.listYears()).toEqual([]);
    const games = await store.getGames();
    expect(Object.keys(games)).toHaveLength(191);
    const { rows } = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM game WHERE name IS NULL",
    );
    expect(rows[0].n).toBe(191);
    expect(games).toEqual(realGames);
  });

  it("imports sample-data.json as a year, backfilling names, and reads it back exactly", async () => {
    const result = await store.importData(
      parsed({ year: 2025, ...sample }),
      context,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        year: 2025,
        scores: 516,
        games: { new: 0, updated: 86 },
        players: { new: 6, total: 6 },
        warnings: [],
      },
    });
    expect(await store.getScores(2025)).toEqual(sample.player_game_scores);
    expect(await store.listYears()).toEqual([2025]);
    const { rows } = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM game WHERE name IS NULL",
    );
    expect(rows[0].n).toBe(105);
    // Metadata from the games-only import survives the later year import.
    expect((await store.getGames())["11"]).toEqual(realGames["11"]);
  });

  it("records the importer and the source filename", async () => {
    const { rows } = await client.query(
      "SELECT imported_by, source_filename FROM year WHERE year = 2025",
    );
    expect(rows).toEqual([{ imported_by: "1", source_filename: "f.json" }]);
  });

  it("answers 409 for an existing year and writes nothing", async () => {
    const before = await client.query("SELECT count(*)::int AS n FROM score");
    const result = await store.importData(
      upload(2025, [row({ bgg_id: 999, game: "New", player: "zed" })]),
      context,
    );
    expect(result).toEqual({ ok: false, status: 409, error: "year_exists" });
    expect(await client.query("SELECT count(*)::int AS n FROM score")).toEqual(
      before,
    );
    expect(
      (await client.query("SELECT 1 FROM game WHERE bgg_id = 999")).rows,
    ).toEqual([]);
  });

  it("rolls everything back when a later step fails", async () => {
    const bad = upload(2030, [row({ bgg_id: 998, game: "Gone", player: "q" })]);
    // A score row with an out-of-range value fails inside the transaction.
    bad.scores[0].score = 2 ** 40;
    await expect(store.importData(bad, context)).rejects.toThrow();
    expect(await store.listYears()).toEqual([2025]);
    expect(
      (await client.query("SELECT 1 FROM game WHERE bgg_id = 998")).rows,
    ).toEqual([]);
    expect(
      (await client.query("SELECT 1 FROM player WHERE name = 'q'")).rows,
    ).toEqual([]);
  });

  it("merges case-variant players with the first spelling and reports renames", async () => {
    const result = await store.importData(
      upload(2026, [
        row({ bgg_id: 237182, player: "KELSIN", game: "Root: Deluxe" }),
        row({ bgg_id: 500, game: "Fresh", player: "newbie", score: -4 }),
      ]),
      context,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        year: 2026,
        games: { new: 1, updated: 1 },
        players: { new: 1, total: 2 },
      },
    });
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.warnings).toEqual([
      'bgg_id 237182 renamed "Root" to "Root: Deluxe" in the file; kept "Root"',
    ]);
  });

  it("reads the merged year back with stored spellings and negative scores", async () => {
    expect(await store.getScores(2026)).toEqual([
      { bgg_id: 237182, game: "Root", player: "kelsin", score: 10, rank: 1 },
      { bgg_id: 500, game: "Fresh", player: "newbie", score: -4, rank: 1 },
    ]);
    expect(await store.listYears()).toEqual([2026, 2025]);
    const { rows } = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM player",
    );
    expect(rows[0].n).toBe(7);
  });
});

describe("data store metadata", () => {
  it("returns metadata-only games and name-only games", async () => {
    await client.query(
      "INSERT INTO game_metadata (bgg_id, min_players, max_players) VALUES (900100, 1, 3)",
    );
    await client.query("INSERT INTO game (bgg_id, name) VALUES (900101, 'N')");
    const games = await store.getGames();
    expect(games["900100"]).toEqual({ players: { min: 1, max: 3 } });
    expect(games["900101"]).toEqual({});
  });

  it("imports more metadata rows than one chunk", async () => {
    const games = Object.fromEntries(
      Array.from({ length: 1200 }, (_, i) => [
        `${800000 + i}`,
        { players: { min: 1, max: 4 } },
      ]),
    );
    const result = await store.importData(parsed({ games }), context);
    expect(result).toMatchObject({ ok: true });
    expect((await store.getGames())["800000"]).toEqual({
      players: { min: 1, max: 4 },
    });
    expect((await store.getGames())["801199"]).toEqual({
      players: { min: 1, max: 4 },
    });
  });

  it("stores the custom image sentinel from an upload", async () => {
    await store.importData(
      parsed({
        games: {
          "900200": {
            players: { min: 1, max: 2 },
            image: "custom",
            ext: ".png",
          },
        },
      }),
      context,
    );
    expect((await store.getGames())["900200"]).toMatchObject({
      image: "custom",
      ext: ".png",
    });
  });

  it("keeps stored metadata when an upload carries none or other values", async () => {
    await store.importData(
      parsed({
        games: {
          "900100": { players: { min: 2, max: 2 } },
          "900101": { players: { min: 4, max: 6 } },
          "900102": {},
        },
      }),
      context,
    );
    const games = await store.getGames();
    expect(games["900100"]).toEqual({ players: { min: 2, max: 2 } });
    expect(games["900101"]).toEqual({ players: { min: 4, max: 6 } });
    expect(
      (await client.query("SELECT 1 FROM game_metadata WHERE bgg_id = 900102"))
        .rows,
    ).toEqual([]);
    const again = await store.importData(
      parsed({ games: { "900100": {} } }),
      context,
    );
    expect(again).toMatchObject({ ok: true });
    expect((await store.getGames())["900100"]).toEqual({
      players: { min: 2, max: 2 },
    });
  });
});

describe("display names", () => {
  const MEMBER = "555444333222111000";

  it("shows display names and discord_id only when resolving names", async () => {
    await client.query(
      `INSERT INTO app_user (discord_id, status, display_name) VALUES ($1, 'approved', 'Dee')`,
      [MEMBER],
    );
    await store.importData(
      upload(2098, [
        row({ player: "deedee" }),
        row({ player: "other", rank: 2 }),
      ]),
      context,
    );
    await client.query(
      `UPDATE player SET discord_id = $1 WHERE name = 'deedee'`,
      [MEMBER],
    );

    expect(
      (await store.getScores(2098, true))!.map((r) => [r.player, r.discord_id]),
    ).toEqual([
      ["Dee", MEMBER],
      ["other", undefined],
    ]);
    expect(
      (await store.getScores(2098))!.map((r) => [r.player, r.discord_id]),
    ).toEqual([
      ["deedee", undefined],
      ["other", undefined],
    ]);

    await addLogin(client, MEMBER, "DeeDiscord");
    await client.query(
      `UPDATE app_user SET display_name = NULL WHERE discord_id = $1`,
      [MEMBER],
    );
    const cleared = (await store.getScores(2098, true))!;
    expect(cleared).toHaveLength(2);
    expect(cleared[0]).toMatchObject({
      player: "DeeDiscord",
      discord_id: MEMBER,
    });
    expect((await store.getScores(2098))![0].player).toBe("deedee");
    expect(cleared[0]).not.toHaveProperty("discord_image");

    const avatar = "https://cdn.discordapp.com/avatars/1/a.png";
    await client.query(`UPDATE "user" SET image = $1 WHERE name = $2`, [
      avatar,
      "DeeDiscord",
    ]);
    const withImage = (await store.getScores(2098, true))!;
    expect(withImage[0].discord_image).toBe(avatar);
    expect(withImage[1]).not.toHaveProperty("discord_image");
    for (const r of (await store.getScores(2098))!)
      expect(r).not.toHaveProperty("discord_image");

    await client.query(
      `UPDATE app_user SET status = 'pending', display_name = 'Dee' WHERE discord_id = $1`,
      [MEMBER],
    );
    expect((await store.getScores(2098, true))![0]).not.toHaveProperty(
      "discord_id",
    );
    expect((await store.getScores(2098, true))![0].player).toBe("deedee");
    expect((await store.getScores(2098, true))![0]).not.toHaveProperty(
      "discord_image",
    );
  });

  it("shows one name for a member's names and collapses a repeated game and year", async () => {
    const dual = "314159265358979323";
    await client.query(
      `INSERT INTO app_user (discord_id, status, display_name) VALUES ($1, 'approved', 'Dual')`,
      [dual],
    );
    await store.importData(
      upload(2091, [
        row({ player: "dual1", rank: 3, score: 5 }),
        row({ player: "dual2", rank: 1, score: 9 }),
        row({ bgg_id: 2, game: "Azul", player: "dual1", rank: 2 }),
      ]),
      context,
    );
    await client.query(
      `UPDATE player SET discord_id = $1 WHERE name LIKE 'dual%'`,
      [dual],
    );
    expect(
      (await store.getScores(2091, true))!.map((r) => [
        r.player,
        r.game,
        r.rank,
      ]),
    ).toEqual([
      ["Dual", "Root", 1],
      ["Dual", "Azul", 2],
    ]);
    expect(await store.getScores(2091)).toHaveLength(3);
  });

  it("falls back to the data-file name for an approved member with no login", async () => {
    const other = "999888777666555444";
    await client.query(
      `INSERT INTO app_user (discord_id, status) VALUES ($1, 'approved')`,
      [other],
    );
    await store.importData(upload(2094, [row({ player: "nologin" })]), context);
    await client.query(
      `UPDATE player SET discord_id = $1 WHERE name = 'nologin'`,
      [other],
    );
    expect((await store.getScores(2094, true))![0]).toMatchObject({
      player: "nologin",
      discord_id: other,
    });
  });

  it("keeps the data-file name for a pending member with a login", async () => {
    const pending = "111222333444555666";
    await client.query(
      `INSERT INTO app_user (discord_id, status) VALUES ($1, 'pending')`,
      [pending],
    );
    await addLogin(client, pending, "PendingDiscord");
    await store.importData(upload(2093, [row({ player: "pend" })]), context);
    await client.query(
      `UPDATE player SET discord_id = $1 WHERE name = 'pend'`,
      [pending],
    );
    const [only] = (await store.getScores(2093, true))!;
    expect(only.player).toBe("pend");
    expect(only).not.toHaveProperty("discord_id");
  });

  it("keeps the data-file name when the Discord name clashes with another player", async () => {
    const clasher = "222333444555666777";
    await client.query(
      `INSERT INTO app_user (discord_id, status) VALUES ($1, 'approved')`,
      [clasher],
    );
    await addLogin(client, clasher, "RIVAL");
    await store.importData(
      upload(2092, [
        row({ player: "clasher" }),
        row({ player: "rival", rank: 2 }),
      ]),
      context,
    );
    await client.query(
      `UPDATE player SET discord_id = $1 WHERE name = 'clasher'`,
      [clasher],
    );
    expect((await store.getScores(2092, true))!.map((r) => r.player)).toEqual([
      "clasher",
      "rival",
    ]);
  });

  it("refuses an upload that adds a player named like a display name, rolling back", async () => {
    await client.query(
      `UPDATE app_user SET display_name = 'Taken' WHERE discord_id = $1`,
      [MEMBER],
    );
    const result = await store.importData(
      upload(2097, [
        row({ player: "fresh" }),
        row({ player: "TAKEN", rank: 2 }),
      ]),
      context,
    );
    expect(result).toEqual({ ok: false, status: 409, error: "name_taken" });
    expect(await store.getScores(2097)).toBeNull();
    expect(
      (await client.query(`SELECT 1 FROM player WHERE name = 'fresh'`)).rows,
    ).toEqual([]);
  });

  it("matches display names to new players with SQL lower-casing", async () => {
    await client.query(
      `UPDATE app_user SET display_name = 'Éclair' WHERE discord_id = $1`,
      [MEMBER],
    );
    const result = await store.importData(
      upload(2095, [row({ player: "éCLAIR" })]),
      context,
    );
    expect(result).toEqual({ ok: false, status: 409, error: "name_taken" });
  });

  it("still accepts an upload reusing the linked player's own name", async () => {
    await client.query(
      `UPDATE app_user SET display_name = 'deedee' WHERE discord_id = $1`,
      [MEMBER],
    );
    const result = await store.importData(
      upload(2096, [row({ player: "DeeDee" })]),
      context,
    );
    expect(result).toMatchObject({ ok: true, value: { players: { new: 0 } } });
  });
});

describe("player count overrides", () => {
  const range = (min: number, max: number) => ({ min, max });
  const ROOT = 237182;

  it("replaces the range for scoring while keeping BGG's", async () => {
    const before = (await store.getGames())[String(ROOT)];
    expect(before.overridden).toBeUndefined();
    const bgg = before.players!;
    expect(await store.setPlayerOverride(ROOT, range(4, 4), "1")).toEqual({
      ok: true,
      value: null,
    });
    expect((await store.getGames())[String(ROOT)]).toEqual({
      ...before,
      players: range(4, 4),
      bggPlayers: bgg,
      overridden: true,
    });
    await store.setPlayerOverride(ROOT, range(3, 5), "42");
    const { rows } = await client.query(
      "SELECT min_players, max_players, updated_by FROM game_player_override WHERE bgg_id = $1",
      [ROOT],
    );
    expect(rows).toEqual([
      { min_players: 3, max_players: 5, updated_by: "42" },
    ]);
  });

  it("lists named games with BGG range and override", async () => {
    const list = await store.listGamePlayers();
    const root = list.find((g) => g.bggId === ROOT)!;
    expect(root.override).toEqual(range(3, 5));
    expect(root.bgg).toEqual(realGames[String(ROOT)].players);
    expect(list.every((g) => g.name)).toBe(true);
    const names = list.map((g) => g.name.toLowerCase());
    expect(names).toEqual([...names].sort());
  });

  it("clears the override, restoring BGG's range", async () => {
    await store.clearPlayerOverride(ROOT);
    expect((await store.getGames())[String(ROOT)]).toEqual(
      realGames[String(ROOT)],
    );
    await expect(store.clearPlayerOverride(ROOT)).resolves.toBeUndefined();
  });

  it("refuses a game with no game row", async () => {
    expect(await store.setPlayerOverride(987654, range(1, 2), "1")).toEqual({
      ok: false,
      status: 404,
      error: "unknown_game",
    });
  });

  it("deletes the override when the range equals BGG's", async () => {
    await store.setPlayerOverride(ROOT, range(4, 4), "1");
    const bgg = realGames[String(ROOT)].players;
    expect(await store.setPlayerOverride(ROOT, bgg, "1")).toEqual({
      ok: true,
      value: null,
    });
    expect(
      (await client.query("SELECT 1 FROM game_player_override")).rows,
    ).toEqual([]);
  });

  it("survives a BGG metadata refresh and masks the new range", async () => {
    await store.setPlayerOverride(ROOT, range(4, 4), "1");
    await client.query(
      "UPDATE game_metadata SET min_players = 1, max_players = 8 WHERE bgg_id = $1",
      [ROOT],
    );
    expect((await store.getGames())[String(ROOT)]).toMatchObject({
      players: range(4, 4),
      bggPlayers: range(1, 8),
      overridden: true,
    });
    await store.clearPlayerOverride(ROOT);
  });

  it("applies to a game with a game row and no metadata", async () => {
    await client.query(
      "INSERT INTO game (bgg_id, name) VALUES (777001, 'Bare')",
    );
    expect(
      await store.setPlayerOverride(777001, range(2, 3), "1"),
    ).toMatchObject({ ok: true });
    expect((await store.getGames())["777001"]).toEqual({
      players: range(2, 3),
      overridden: true,
    });
    expect(
      (await store.listGamePlayers()).find((g) => g.bggId === 777001),
    ).toEqual({
      bggId: 777001,
      name: "Bare",
      bgg: null,
      override: range(2, 3),
    });
  });

  it("enforces the range check in the database", async () => {
    await expect(
      client.query(
        "INSERT INTO game_player_override (bgg_id, min_players, max_players) VALUES (777001, 5, 4)",
      ),
    ).rejects.toThrow();
  });
});
