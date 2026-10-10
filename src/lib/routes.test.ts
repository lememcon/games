import { describe, expect, it } from "vitest";

import {
  buildFilterSearch,
  gamePath,
  isYear,
  parseFilterSearch,
  parseScoreboardPath,
  sharePath,
  yearPath,
  type FilterState,
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
    expect(
      buildFilterSearch({ players: [], hidePlayed: false, sort: "total" }),
    ).toBe("");
  });

  it("builds players, hidePlayed and both", () => {
    expect(
      buildFilterSearch({
        players: ["Alice", "Bob"],
        hidePlayed: false,
        sort: "total",
      }),
    ).toBe("?players=Alice,Bob");
    expect(
      buildFilterSearch({ players: [], hidePlayed: true, sort: "total" }),
    ).toBe("?hidePlayed=1");
    expect(
      buildFilterSearch({
        players: ["Alice"],
        hidePlayed: true,
        sort: "total",
      }),
    ).toBe("?players=Alice&hidePlayed=1");
  });

  it("encodes commas, ampersands and spaces inside names", () => {
    expect(
      buildFilterSearch({
        players: ["a,b", "c&d", "e f"],
        hidePlayed: false,
        sort: "total",
      }),
    ).toBe("?players=a%2Cb,c%26d,e%20f");
  });
});

describe("apostrophes in names", () => {
  it("escapes ' as %27 and round-trips", () => {
    const filters: FilterState = {
      players: ["O'Brien"],
      hidePlayed: false,
      sort: "total",
    };
    const search = buildFilterSearch(filters);
    expect(search).toContain("%27");
    expect(search).not.toContain("'");
    expect(parseFilterSearch(search)).toEqual(filters);
  });
});

describe("parseFilterSearch", () => {
  it("round-trips awkward names", () => {
    const filters: FilterState = {
      players: ["a,b", "c&d", "e f"],
      hidePlayed: true,
      sort: "total",
    };
    expect(parseFilterSearch(buildFilterSearch(filters))).toEqual(filters);
  });

  it("accepts a missing leading ?", () => {
    expect(parseFilterSearch("players=Alice")).toEqual({
      players: ["Alice"],
      hidePlayed: false,
      sort: "total",
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
      sort: "total",
    });
  });

  it.each(["0", "true", ""])("reads hidePlayed=%j as off", (v) => {
    expect(parseFilterSearch(`?players=Alice&hidePlayed=${v}`)).toEqual({
      players: ["Alice"],
      hidePlayed: false,
      sort: "total",
    });
  });

  it("handles empty players, duplicates, blanks and unknown params", () => {
    expect(parseFilterSearch("?players=&x=1")).toEqual({
      players: [],
      hidePlayed: false,
      sort: "total",
    });
    expect(parseFilterSearch("?players=Al,Al,,%20Bo%20&x=1&flag")).toEqual({
      players: ["Al", "Bo"],
      hidePlayed: false,
      sort: "total",
    });
  });

  it("drops malformed escapes", () => {
    expect(parseFilterSearch("?players=%E0,Bob")).toEqual({
      players: ["Bob"],
      hidePlayed: false,
      sort: "total",
    });
  });
});

describe("sort in the query", () => {
  it("omits total and writes the other modes", () => {
    const base = { players: ["Al"], hidePlayed: false };
    expect(buildFilterSearch({ ...base, sort: "total" })).toBe("?players=Al");
    expect(buildFilterSearch({ ...base, sort: "lowest" })).toBe(
      "?players=Al&sort=lowest",
    );
    expect(
      buildFilterSearch({ players: [], hidePlayed: true, sort: "even" }),
    ).toBe("?hidePlayed=1&sort=even");
  });

  it.each(["total", "lowest", "even"] as const)("round-trips %s", (sort) => {
    const filters = { players: ["a,b", "Cy"], hidePlayed: true, sort };
    expect(parseFilterSearch(buildFilterSearch(filters))).toEqual(filters);
  });

  it("treats a lone sort as whole state", () => {
    expect(parseFilterSearch("?sort=even")).toEqual({
      players: [],
      hidePlayed: false,
      sort: "even",
    });
  });

  it("falls back to total for unknown or malformed values", () => {
    expect(parseFilterSearch("?sort=bogus")?.sort).toBe("total");
    expect(parseFilterSearch("?sort=%E0")?.sort).toBe("total");
    expect(parseFilterSearch("?players=Al&sort=")?.sort).toBe("total");
  });

  it("is carried by sharePath", () => {
    expect(
      sharePath(2025, { players: [], hidePlayed: false, sort: "lowest" }),
    ).toBe("/2025?sort=lowest");
  });
});

describe("sharePath", () => {
  it("appends the filter query to the year path", () => {
    expect(
      sharePath(2025, { players: ["Al"], hidePlayed: true, sort: "total" }),
    ).toBe("/2025?players=Al&hidePlayed=1");
    expect(
      sharePath("2025", { players: [], hidePlayed: false, sort: "total" }),
    ).toBe("/2025");
  });
});
