import { describe, expect, it } from "vitest";

import {
  MAX_IMPORT_ENTRIES,
  MAX_PLAYED_COUNT,
  parseBggId,
  parseImportBody,
  parsePlayedBody,
  parseYear,
  toCounts,
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
    [{ count: 0 }, false],
    [{ count: 1 }, true],
    [{ count: 5 }, true],
    [{ count: MAX_PLAYED_COUNT }, true],
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
    [{ count: -1 }],
    [{ count: MAX_PLAYED_COUNT + 1 }],
    [{ count: 1.5 }],
    [{ count: "3" }],
    [{ count: true }],
    [{ count: null }],
    [{ count: NaN }],
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

  it("parses legacy counts into played ids", () => {
    expect(parseImportBody({ counts: { "11": 3, "200": 1 } })).toEqual({
      ok: true,
      value: new Set([11, 200]),
    });
  });

  it.each([{ games: [] }, { counts: {} }])("accepts an empty %j", (body) => {
    expect(parseImportBody(body)).toEqual({ ok: true, value: new Set() });
  });

  it("accepts exactly the maximum number of entries", () => {
    const ids = Array.from({ length: MAX_IMPORT_ENTRIES }, (_, i) => i + 1);
    expect(parseImportBody({ games: ids.map(String) }).ok).toBe(true);
    const counts = Object.fromEntries(ids.map((id) => [id, 1]));
    expect(parseImportBody({ counts }).ok).toBe(true);
  });

  it("rejects more than the maximum number of entries", () => {
    const ids = Array.from({ length: MAX_IMPORT_ENTRIES + 1 }, (_, i) => i + 1);
    expect(parseImportBody({ games: ids.map(String) })).toEqual({ ok: false });
    const counts = Object.fromEntries(ids.map((id) => [id, 1]));
    expect(parseImportBody({ counts })).toEqual({ ok: false });
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
    [{ counts: { abc: 1 } }],
    [{ counts: { "0": 1 } }],
    [{ counts: { "11": 0 } }],
    [{ counts: { "11": MAX_PLAYED_COUNT + 1 } }],
    [{ counts: { "11": 1.5 } }],
    [{ counts: { "11": "2" } }],
    [{ counts: { "11": true } }],
    [{ counts: [1] }],
    [{ counts: null }],
    [{ counts: {}, extra: 1 }],
    [{}],
    [{ other: {} }],
    [[]],
    [null],
    ["x"],
  ])("rejects %j", (body) => {
    expect(parseImportBody(body)).toEqual({ ok: false });
  });
});

describe("toCounts", () => {
  it("maps every played id to a count of 1", () => {
    expect(toCounts(["11", "200"])).toEqual({ "11": 1, "200": 1 });
    expect(toCounts([])).toEqual({});
  });
});
