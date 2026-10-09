import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAX_ERRORS,
  MAX_ROWS,
  cleanFilename,
  parseImport,
  type NormalizedImport,
} from "./import";

const root = path.resolve(import.meta.dirname, "..");
const readJson = (file: string) =>
  JSON.parse(readFileSync(path.join(root, file), "utf8"));
const sample = readJson("sample-data.json");
const realGames = readJson("src/assets/games.json");

const row = (over: Record<string, unknown> = {}) => ({
  bgg_id: 1,
  game: "Root",
  player: "kelsin",
  score: 10,
  rank: 1,
  ...over,
});
const year = (rows: unknown[] = [row()], extra: object = {}) => ({
  year: 2026,
  player_game_scores: rows,
  ...extra,
});
const meta = (over: Record<string, unknown> = {}) => ({
  players: { min: 2, max: 4 },
  image: "https://cf.geekdo-images.com/a.jpg",
  ext: ".jpg",
  ...over,
});

function ok(raw: unknown): NormalizedImport {
  const result = parseImport(raw);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
}
function errors(raw: unknown) {
  const result = parseImport(raw);
  if (result.ok) throw new Error("expected validation errors");
  return result.errors;
}
const paths = (raw: unknown) => errors(raw).map((e) => e.path);

describe("real data", () => {
  it("accepts sample-data.json with a year added", () => {
    const value = ok({ year: 2025, ...sample });
    expect(value.year).toBe(2025);
    expect(value.scores).toHaveLength(516);
    expect(value.games).toHaveLength(86);
    expect(value.players).toHaveLength(6);
    expect(value.warnings).toEqual([]);
    expect(value.games.every((g) => g.name !== null)).toBe(true);
  });

  it("accepts the bare games.json as a games-only upload", () => {
    const value = ok(realGames);
    expect(value.year).toBeNull();
    expect(value.scores).toEqual([]);
    expect(value.games).toHaveLength(191);
    expect(value.games.every((g) => g.name === null)).toBe(true);
    expect(value.games.find((g) => g.bggId === 417258)).toMatchObject({
      imageUrl: null,
      imageExt: ".png",
      minPlayers: 2,
      maxPlayers: 4,
    });
  });

  it("backfills names from score rows and leaves metadata-only games null", () => {
    const value = ok({ year: 2025, ...sample, games: realGames });
    expect(value.games).toHaveLength(191);
    expect(value.games.filter((g) => g.name === null)).toHaveLength(105);
    expect(value.games.filter((g) => g.name !== null)).toHaveLength(86);
    const root = value.games.find((g) => g.bggId === 237182)!;
    expect(root.name).toBe("Root");
    expect(root.imageUrl).toMatch(/^https:/);
  });
});

describe("upload shape", () => {
  it("accepts a wrapped games-only upload", () => {
    const value = ok({ games: { "5": meta() }, extra: true });
    expect(value).toMatchObject({ year: null, scores: [], players: [] });
    expect(value.games[0]).toMatchObject({ bggId: 5, name: null });
  });

  it("rejects a year without scores and scores without a year", () => {
    expect(paths({ year: 2026 })).toEqual(["player_game_scores"]);
    expect(paths({ player_game_scores: [row()] })).toEqual(["year"]);
  });

  it("rejects an empty games-only upload and non-objects", () => {
    expect(paths({})).toEqual(["games"]);
    expect(paths({ games: {} })).toEqual(["games"]);
    expect(paths([])).toEqual([""]);
    expect(paths(null)).toEqual([""]);
    expect(paths("x")).toEqual([""]);
  });

  it("rejects non-object games and empty or oversized score lists", () => {
    expect(paths({ games: [] })).toEqual(["games"]);
    expect(paths(year([], {}))).toEqual(["player_game_scores"]);
    expect(paths(year("nope" as never))).toEqual(["player_game_scores"]);
    expect(paths(year([row()], { games: 5 }))).toEqual(["games"]);
  });

  it.each([1999, 2101, 2026.5, "2026", null])("rejects year %s", (bad) => {
    expect(paths({ ...year(), year: bad })).toEqual(["year"]);
  });
});

describe("score rows", () => {
  it("reports every bad field with its row index", () => {
    const errs = errors(
      year([
        row({ bgg_id: 0 }),
        row({ game: " " }),
        row({ player: 5 }),
        row({ score: 1.5 }),
        row({ rank: "1" }),
        "nope",
      ]),
    );
    expect(errs.map((e) => e.path)).toEqual([
      "player_game_scores[0].bgg_id",
      "player_game_scores[1].game",
      "player_game_scores[2].player",
      "player_game_scores[3].score",
      "player_game_scores[4].rank",
      "player_game_scores[5]",
    ]);
  });

  it("allows negative and zero scores", () => {
    const value = ok(year([row({ score: -5, rank: 0 })]));
    expect(value.scores[0]).toMatchObject({ score: -5, rank: 0 });
  });

  it("trims strings and caps their length", () => {
    expect(ok(year([row({ player: "  pat " })])).players).toEqual(["pat"]);
    expect(paths(year([row({ game: "x".repeat(201) })]))).toEqual([
      "player_game_scores[0].game",
    ]);
  });

  it("rejects ids and numbers beyond a Postgres integer", () => {
    expect(paths(year([row({ bgg_id: 2 ** 31 })]))).toHaveLength(1);
    expect(paths(year([row({ score: 2 ** 31 })]))).toHaveLength(1);
  });

  it("caps the number of rows", () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) =>
      row({ player: `p${i}` }),
    );
    expect(paths(year(rows))).toEqual(["player_game_scores"]);
    expect(ok(year(rows.slice(0, MAX_ROWS))).scores).toHaveLength(MAX_ROWS);
  });

  it("caps the number of reported errors", () => {
    const rows = Array.from({ length: 80 }, () => row({ score: "x" }));
    const errs = errors(year(rows));
    expect(errs).toHaveLength(MAX_ERRORS + 1);
    expect(errs.at(-1)!.message).toMatch(/Too many/);
  });

  it("rejects duplicates, including case variants of a player", () => {
    expect(paths(year([row(), row({ player: "KELSIN" })]))).toEqual([
      "player_game_scores[1]",
    ]);
  });

  it("rejects one bgg_id with two names", () => {
    expect(paths(year([row(), row({ player: "b", game: "Other" })]))).toEqual([
      "player_game_scores[1].game",
    ]);
  });

  it("rejects one name under two bgg_ids", () => {
    expect(paths(year([row(), row({ bgg_id: 2 })]))).toEqual([
      "player_game_scores[1].game",
    ]);
  });

  it("does not echo long values in messages", () => {
    const long = "y".repeat(190);
    const errs = errors(
      year([row({ game: long }), row({ bgg_id: 2, game: long })]),
    );
    expect(errs[0].message.length).toBeLessThan(120);
  });

  it("merges case-variant players into the first spelling and warns once", () => {
    const value = ok(
      year([
        row({ player: "Kelsin" }),
        row({ bgg_id: 2, game: "B", player: "kelsin" }),
        row({ bgg_id: 3, game: "C", player: "kelsin" }),
      ]),
    );
    expect(value.players).toEqual(["Kelsin"]);
    expect(value.scores.map((s) => s.player)).toEqual([
      "Kelsin",
      "Kelsin",
      "Kelsin",
    ]);
    expect(value.warnings).toHaveLength(1);
    expect(value.warnings[0]).toContain("one player");
  });

  it("drops extra feed fields", () => {
    const value = ok(year([row({ extra: "x" })]));
    expect(value.scores[0]).toEqual({
      bggId: 1,
      player: "kelsin",
      score: 10,
      rank: 1,
    });
  });
});

describe("games map", () => {
  const gamesErrors = (games: unknown) => paths({ games });

  it("rejects prototype and non-integer keys", () => {
    const polluted = JSON.parse(
      '{"__proto__": {"players": {"min":1,"max":2}}}',
    );
    expect(gamesErrors(polluted)).toHaveLength(1);
    expect(gamesErrors({ constructor: meta() })).toHaveLength(1);
    expect(gamesErrors({ "1.5": meta() })).toHaveLength(1);
    expect(gamesErrors({ "01": meta() })).toHaveLength(1);
    expect(gamesErrors({ "-3": meta() })).toHaveLength(1);
    expect(gamesErrors({ "99999999999": meta() })).toHaveLength(1);
    expect(gamesErrors({ "2147483648": meta() })).toHaveLength(1);
    expect(({} as Record<string, unknown>).players).toBeUndefined();
  });

  it("accepts metadata-only entries with any subset of fields", () => {
    const value = ok({ games: { "7": {}, "8": { ext: ".png" } } });
    expect(value.games).toEqual([
      expect.objectContaining({ bggId: 7, name: null, minPlayers: null }),
      expect.objectContaining({ bggId: 8, imageExt: ".png" }),
    ]);
  });

  it("validates players", () => {
    expect(gamesErrors({ "1": meta({ players: { min: 5, max: 2 } }) })).toEqual(
      ['games["1"].players'],
    );
    expect(
      gamesErrors({ "1": meta({ players: { min: -1, max: 2 } }) }),
    ).toEqual(['games["1"].players']);
    expect(gamesErrors({ "1": meta({ players: "2-4" }) })).toEqual([
      'games["1"].players',
    ]);
    expect(gamesErrors({ "1": 5 })).toEqual(['games["1"]']);
  });

  it("validates ext against the allowlist", () => {
    for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".gif"])
      expect(ok({ games: { "1": meta({ ext }) } }).games[0].imageExt).toBe(ext);
    for (const ext of [".exe", "jpg", ".JPG", 5, ""])
      expect(gamesErrors({ "1": meta({ ext }) })).toEqual(['games["1"].ext']);
  });

  it("maps image 'custom' to a null url and keeps the ext", () => {
    const game = ok({ games: { "1": meta({ image: "custom" }) } }).games[0];
    expect(game.imageUrl).toBeNull();
    expect(game.imageExt).toBe(".jpg");
  });

  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    " https://example.com/a.jpg",
    "https://example.com/a.jpg ",
    "http://example.com/a.jpg",
    "not a url",
    "",
    `https://example.com/${"a".repeat(2048)}`,
    5,
  ])("rejects image %j", (image) => {
    expect(gamesErrors({ "1": meta({ image }) })).toEqual(['games["1"].image']);
  });

  it("accepts an uppercase https scheme", () => {
    const game = ok({
      games: { "1": meta({ image: "HTTPS://example.com/a.jpg" }) },
    }).games[0];
    expect(game.imageUrl).toBe("HTTPS://example.com/a.jpg");
  });

  it("caps the number of entries", () => {
    const games = Object.fromEntries(
      Array.from({ length: MAX_ROWS + 1 }, (_, i) => [String(i + 1), {}]),
    );
    expect(gamesErrors(games)).toEqual(["games"]);
  });

  it("combines games metadata with score rows in a year upload", () => {
    const value = ok(
      year([row()], { games: { "1": meta(), "9": meta({ ext: ".png" }) } }),
    );
    expect(value.games).toEqual([
      {
        bggId: 1,
        name: "Root",
        minPlayers: 2,
        maxPlayers: 4,
        imageUrl: "https://cf.geekdo-images.com/a.jpg",
        imageExt: ".jpg",
      },
      expect.objectContaining({ bggId: 9, name: null }),
    ]);
  });

  it("creates a bare game for a score row with no metadata", () => {
    expect(ok(year()).games).toEqual([
      {
        bggId: 1,
        name: "Root",
        minPlayers: null,
        maxPlayers: null,
        imageUrl: null,
        imageExt: null,
      },
    ]);
  });
});

describe("cleanFilename", () => {
  it("strips directories and caps the length", () => {
    expect(cleanFilename("C:\\Users\\me\\scores.json")).toBe("scores.json");
    expect(cleanFilename("../../etc/scores.json")).toBe("scores.json");
    expect(cleanFilename(`${"a".repeat(300)}.json`)).toHaveLength(100);
  });

  it("returns null when nothing is left", () => {
    expect(cleanFilename(undefined)).toBeNull();
    expect(cleanFilename(null)).toBeNull();
    expect(cleanFilename("  ")).toBeNull();
    expect(cleanFilename("dir/")).toBeNull();
  });
});
