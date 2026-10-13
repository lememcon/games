import { describe, expect, it } from "vitest";

import {
  MAX_IMPORT_ENTRIES,
  MAX_MARK_MEMBERS,
  parseBggId,
  parseImportBody,
  parsePlayedBody,
  parsePlayersBody,
  parseYear,
} from "./played";

describe("parseYear", () => {
  it.each([
    ["2025", 2025],
    ["1999", 1999],
    ["25", null],
    ["20255", null],
    ["2025a", null],
    ["-2025", null],
    ["", null],
    [undefined, null],
    [2025, null],
  ])("%j -> %j", (raw, expected) => {
    expect(parseYear(raw)).toBe(expected);
  });
});

describe("parseBggId", () => {
  it.each([
    ["1", 1],
    ["174430", 174430],
    ["2147483647", 2147483647],
    ["2147483648", null],
    ["99999999999", null],
    ["0", null],
    ["012", null],
    ["-1", null],
    ["1.5", null],
    ["abc", null],
    [undefined, null],
    [12, null],
  ])("%j -> %j", (raw, expected) => {
    expect(parseBggId(raw)).toBe(expected);
  });
});

describe("parsePlayedBody", () => {
  it.each([
    [{ played: true }, true],
    [{ played: false }, false],
  ])("accepts %j as %j", (body, value) => {
    expect(parsePlayedBody(body)).toEqual({ ok: true, value });
  });

  it.each([
    [{ played: "true" }],
    [{ played: 1 }],
    [{ played: 0 }],
    [{ played: null }],
    [{ played: true, extra: 1 }],
    [{ played: true, count: 1 }],
    [{ count: 0 }],
    [{ count: 1 }],
    [{}],
    [{ count: 1, extra: true }],
    [{ other: 1 }],
    [[true]],
    [null],
    [true],
    ["3"],
    [undefined],
  ])("rejects %j", (body) => {
    expect(parsePlayedBody(body)).toEqual({ ok: false });
  });
});

describe("parseImportBody", () => {
  it("parses a games list into played ids, dropping duplicates", () => {
    expect(parseImportBody({ games: ["11", "200", "11"] })).toEqual({
      ok: true,
      value: new Set([11, 200]),
    });
  });

  it("accepts an empty games list", () => {
    expect(parseImportBody({ games: [] })).toEqual({
      ok: true,
      value: new Set(),
    });
  });

  it("accepts exactly the maximum number of entries", () => {
    const ids = Array.from({ length: MAX_IMPORT_ENTRIES }, (_, i) => i + 1);
    expect(parseImportBody({ games: ids.map(String) }).ok).toBe(true);
  });

  it("rejects more than the maximum number of entries", () => {
    const ids = Array.from({ length: MAX_IMPORT_ENTRIES + 1 }, (_, i) => i + 1);
    expect(parseImportBody({ games: ids.map(String) })).toEqual({ ok: false });
  });

  it("counts duplicates toward the maximum", () => {
    const games = Array.from({ length: MAX_IMPORT_ENTRIES + 1 }, () => "11");
    expect(parseImportBody({ games })).toEqual({ ok: false });
  });

  it.each([
    [{ games: ["abc"] }],
    [{ games: ["0"] }],
    [{ games: ["012"] }],
    [{ games: [11] }],
    [{ games: [null] }],
    [{ games: "11" }],
    [{ games: { "11": true } }],
    [{ games: null }],
    [{ games: [], extra: 1 }],
    [{ games: [], counts: {} }],
    [{ counts: {} }],
    [{ counts: { "11": 1, "200": 3 } }],
    [{}],
    [{ other: {} }],
    [[]],
    [null],
    ["x"],
  ])("rejects %j", (body) => {
    expect(parseImportBody(body)).toEqual({ ok: false });
  });
});

describe("parsePlayersBody", () => {
  const A = "222222222222222222";
  const B = "333333333333333333";

  it("accepts snowflakes and dedupes them", () => {
    expect(parsePlayersBody({ discordIds: [A, B, A] })).toEqual({
      ok: true,
      value: new Set([A, B]),
    });
  });

  it("counts the cap before deduping", () => {
    const many = (n: number) => Array.from({ length: n }, () => A);
    expect(parsePlayersBody({ discordIds: many(MAX_MARK_MEMBERS) }).ok).toBe(
      true,
    );
    expect(
      parsePlayersBody({ discordIds: many(MAX_MARK_MEMBERS + 1) }),
    ).toEqual({ ok: false });
  });

  it.each([
    [{ discordIds: [] }],
    [{ discordIds: [1] }],
    [{ discordIds: ["abc"] }],
    [{ discordIds: ["1234"] }],
    [{ discordIds: "222222222222222222" }],
    [{ discordIds: ["222222222222222222"], extra: 1 }],
    [{}],
    [[]],
    [null],
  ])("rejects %j", (body) => {
    expect(parsePlayersBody(body)).toEqual({ ok: false });
  });
});
