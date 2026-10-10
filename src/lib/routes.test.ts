import { describe, expect, it } from "vitest";

import {
  buildFilterSearch,
  gamePath,
  isYear,
  parseFilterSearch,
  parseScoreboardPath,
  sharePath,
  yearPath,
} from "@/lib/routes";

describe("isYear", () => {
  it("accepts exactly four digits", () => {
    expect(isYear("2024")).toBe(true);
  });

  it.each(["abc", "12345", "202", ""])("rejects %j", (s) => {
    expect(isYear(s)).toBe(false);
  });
});

describe("path builders", () => {
  it("builds year and game paths", () => {
    expect(yearPath("2024")).toBe("/2024");
    expect(yearPath(2024)).toBe("/2024");
    expect(gamePath("2024", "11")).toBe("/2024/games/11");
    expect(gamePath(2024, 11)).toBe("/2024/games/11");
  });
});

describe("parseScoreboardPath", () => {
  it.each([
    ["/", { kind: "home" }],
    ["/2024", { kind: "year", year: "2024" }],
    ["/2024/", { kind: "year", year: "2024" }],
    ["/2024/games/11", { kind: "year", year: "2024", gameId: "11" }],
    ["/games/11", { kind: "legacyGame", id: "11" }],
    ["/admin", { kind: "unknown" }],
    ["/profile", { kind: "unknown" }],
    ["/players/x", { kind: "unknown" }],
    ["/2024/games", { kind: "unknown" }],
    ["/2024/foo", { kind: "unknown" }],
    ["/2024/games/11/x", { kind: "unknown" }],
    ["/12345", { kind: "unknown" }],
    ["/games", { kind: "unknown" }],
    ["/admin/foo", { kind: "unknown" }],
    ["/profile/x", { kind: "unknown" }],
  ])("parses %s", (path, expected) => {
    expect(parseScoreboardPath(path)).toEqual(expected);
  });
});

describe("buildFilterSearch", () => {
  it("is empty with no filters on", () => {
    expect(buildFilterSearch({ players: [], hidePlayed: false })).toBe("");
  });

  it("builds players, hidePlayed and both", () => {
    expect(
      buildFilterSearch({ players: ["Alice", "Bob"], hidePlayed: false }),
    ).toBe("?players=Alice,Bob");
    expect(buildFilterSearch({ players: [], hidePlayed: true })).toBe(
      "?hidePlayed=1",
    );
    expect(buildFilterSearch({ players: ["Alice"], hidePlayed: true })).toBe(
      "?players=Alice&hidePlayed=1",
    );
  });

  it("encodes commas, ampersands and spaces inside names", () => {
    expect(
      buildFilterSearch({ players: ["a,b", "c&d", "e f"], hidePlayed: false }),
    ).toBe("?players=a%2Cb,c%26d,e%20f");
  });
});

describe("parseFilterSearch", () => {
  it("round-trips awkward names", () => {
    const filters = { players: ["a,b", "c&d", "e f"], hidePlayed: true };
    expect(parseFilterSearch(buildFilterSearch(filters))).toEqual(filters);
  });

  it("accepts a missing leading ?", () => {
    expect(parseFilterSearch("players=Alice")).toEqual({
      players: ["Alice"],
      hidePlayed: false,
    });
  });

  it("is null without either param", () => {
    expect(parseFilterSearch("")).toBeNull();
    expect(parseFilterSearch("?foo=1&bar")).toBeNull();
  });

  it("treats a lone hidePlayed as whole state", () => {
    expect(parseFilterSearch("?hidePlayed=1")).toEqual({
      players: [],
      hidePlayed: true,
    });
  });

  it.each(["0", "true", ""])("reads hidePlayed=%j as off", (v) => {
    expect(parseFilterSearch(`?players=Alice&hidePlayed=${v}`)).toEqual({
      players: ["Alice"],
      hidePlayed: false,
    });
  });

  it("handles empty players, duplicates, blanks and unknown params", () => {
    expect(parseFilterSearch("?players=&x=1")).toEqual({
      players: [],
      hidePlayed: false,
    });
    expect(parseFilterSearch("?players=Al,Al,,%20Bo%20&x=1&flag")).toEqual({
      players: ["Al", "Bo"],
      hidePlayed: false,
    });
  });

  it("drops malformed escapes", () => {
    expect(parseFilterSearch("?players=%E0,Bob")).toEqual({
      players: ["Bob"],
      hidePlayed: false,
    });
  });
});

describe("sharePath", () => {
  it("appends the filter query to the year path", () => {
    expect(sharePath(2025, { players: ["Al"], hidePlayed: true })).toBe(
      "/2025?players=Al&hidePlayed=1",
    );
    expect(sharePath("2025", { players: [], hidePlayed: false })).toBe("/2025");
  });
});
