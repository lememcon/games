import { describe, expect, it } from "vitest";

import { gamePath, isYear, parseScoreboardPath, yearPath } from "@/lib/routes";

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
