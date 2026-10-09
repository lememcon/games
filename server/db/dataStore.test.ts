import { readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseImport } from "../import";
import type { ImportContext } from "../types";
import { createDataStore } from "./dataStore";
import { createTestDb } from "./testDb";

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
  it("starts empty", async () => {
    expect(await store.listYears()).toEqual([]);
    expect(await store.getGames()).toEqual({});
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
    expect(games["417258"]).toEqual({
      players: { min: 2, max: 4 },
      ext: ".png",
    });
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
