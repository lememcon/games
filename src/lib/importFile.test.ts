import { describe, expect, it } from "vitest";

import {
  fileYear,
  parseFile,
  prepareImport,
  problemsFrom,
} from "@/lib/importFile";

const rows = [
  { bgg_id: 1, game: "A", player: "x", score: 5, rank: 1 },
  { bgg_id: 1, game: "A", player: "y", score: 4, rank: 2 },
  { bgg_id: 2, game: "B", player: "x", score: 3, rank: 1 },
];
const games = { 1: { players: { min: 2, max: 4 } }, 9: {} };

describe("parseFile", () => {
  it("parses a JSON object", () => {
    expect(parseFile('{"a":1}')).toEqual({ ok: true, raw: { a: 1 } });
  });

  it("rejects invalid JSON", () => {
    expect(parseFile("{nope")).toEqual({
      ok: false,
      error: "That file isn't valid JSON.",
    });
  });

  it.each(["[]", "null", "3"])("rejects non-object JSON %s", (text) => {
    expect(parseFile(text)).toMatchObject({ ok: false });
  });
});

describe("fileYear", () => {
  it("reads a numeric or string year", () => {
    expect(fileYear({ year: 2026 })).toBe("2026");
    expect(fileYear({ year: "2026" })).toBe("2026");
  });

  it("is empty when the file has no year", () => {
    expect(fileYear({})).toBe("");
    expect(fileYear({ year: null })).toBe("");
  });
});

describe("prepareImport", () => {
  it("builds a year upload and counts rows, games and players", () => {
    expect(
      prepareImport({ player_game_scores: rows, extra: 1 }, " 2027 "),
    ).toEqual({
      ok: true,
      body: { year: 2027, player_game_scores: rows },
      summary: "3 score rows, 2 games, 2 players",
      year: 2027,
    });
  });

  it("includes the games map of a year upload", () => {
    const result = prepareImport({ player_game_scores: rows, games }, "2027");
    expect(result).toMatchObject({
      ok: true,
      body: { year: 2027, player_game_scores: rows, games },
      summary: "3 score rows, 2 games, 2 players, details for 2 games",
    });
  });

  it("counts junk rows without throwing", () => {
    expect(
      prepareImport({ player_game_scores: [1, null] }, "2027"),
    ).toMatchObject({
      ok: true,
      summary: "2 score rows, 1 games, 1 players",
    });
  });

  it("requires a year for scores", () => {
    expect(prepareImport({ player_game_scores: rows }, " ")).toEqual({
      ok: false,
      error: "Enter a year for this scores file.",
    });
  });

  it("requires scores to be a list", () => {
    expect(prepareImport({ player_game_scores: {} }, "2027")).toMatchObject({
      ok: false,
      error: "player_game_scores must be a list.",
    });
  });

  it.each(["20x7", "207", "20270"])("rejects the year %s", (year) => {
    expect(prepareImport({ player_game_scores: rows }, year)).toEqual({
      ok: false,
      error: "Year must be a four-digit number.",
    });
  });

  it("builds a games-only upload from a games key", () => {
    expect(prepareImport({ games }, "")).toEqual({
      ok: true,
      body: { games },
      summary: "2 games, no year",
      year: null,
    });
  });

  it("wraps a bare games map", () => {
    expect(prepareImport(games, "")).toMatchObject({
      ok: true,
      body: { games },
      summary: "2 games, no year",
    });
  });

  it("rejects a year on a games-only file", () => {
    expect(prepareImport({ games }, "2027")).toEqual({
      ok: false,
      error: "This file has no scores. Clear the year to import games only.",
    });
  });

  it.each([[{ games: {} }], [{ games: [] }], [{ games: null }]])(
    "rejects an empty games map %j",
    (raw) => {
      expect(prepareImport(raw, "")).toEqual({
        ok: false,
        error: "The games map is empty.",
      });
    },
  );

  it.each([[{}], [{ foo: 1 }], [{ 1: {}, foo: 1 }]])(
    "rejects an unrecognised file %j",
    (raw) => {
      expect(prepareImport(raw, "")).toMatchObject({
        ok: false,
        error: expect.stringContaining("Unrecognised file"),
      });
    },
  );
});

describe("problemsFrom", () => {
  it("reads the 422 error list", () => {
    expect(
      problemsFrom({ errors: [{ path: "year", message: "bad" }, 3, {}] }),
    ).toEqual([
      { path: "year", message: "bad" },
      { path: "", message: "" },
    ]);
  });

  it.each([[null], [{}], [{ errors: "x" }], ["x"]])(
    "is empty for %j",
    (body) => {
      expect(problemsFrom(body)).toEqual([]);
    },
  );
});
