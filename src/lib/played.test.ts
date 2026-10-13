import { describe, expect, it } from "vitest";

import {
  addOptions,
  defaultYear,
  gameNamesById,
  playedGames,
  toPlayedMap,
  toPlayedMaps,
} from "@/lib/played";
import type { PlayerGameScore } from "@/types";

describe("toPlayedMap", () => {
  it("maps each id to 1", () => {
    expect(toPlayedMap(["1", "2"])).toEqual({ "1": 1, "2": 1 });
  });

  it("reads a missing list as empty", () => {
    expect(toPlayedMap(undefined)).toEqual({});
  });
});

describe("toPlayedMaps", () => {
  it("reads a missing record as empty", () => {
    expect(toPlayedMaps(undefined)).toEqual({});
  });

  it("reads an empty record as empty", () => {
    expect(toPlayedMaps({})).toEqual({});
  });

  it("maps each member's ids to 1", () => {
    expect(toPlayedMaps({ a: ["1", "2"], b: [], c: ["3"] })).toEqual({
      a: { "1": 1, "2": 1 },
      b: {},
      c: { "3": 1 },
    });
  });
});

describe("gameNamesById", () => {
  it("keys names by string bgg id", () => {
    const rows = [
      { bgg_id: 1, game: "Root" },
      { bgg_id: 1, game: "Root" },
      { bgg_id: 2, game: "Azul" },
    ] as PlayerGameScore[];
    expect(gameNamesById(rows)).toEqual({ "1": "Root", "2": "Azul" });
  });
});

describe("playedGames", () => {
  it("sorts by name ignoring case and falls back to Game <id>", () => {
    const names = { "1": "root", "2": "Azul" };
    expect(playedGames({ "1": 1, "2": 1, "9": 1 }, names)).toEqual([
      { id: "2", name: "Azul" },
      { id: "9", name: "Game 9" },
      { id: "1", name: "root" },
    ]);
  });
});

describe("addOptions", () => {
  it("lists unplayed games sorted by name", () => {
    const names = { "1": "root", "2": "Azul", "3": "Catan" };
    expect(addOptions(names, { "3": 1 })).toEqual([
      { value: "2", label: "Azul" },
      { value: "1", label: "root" },
    ]);
  });
});

describe("defaultYear", () => {
  const now = new Date(2026, 5, 1);

  it("prefers the current year", () => {
    expect(defaultYear(["2024", "2026", "2027"], now)).toBe("2026");
  });

  it("falls back to the last year", () => {
    expect(defaultYear(["2023", "2024"], now)).toBe("2024");
  });

  it("is empty with no years", () => {
    expect(defaultYear([], now)).toBe("");
  });
});
