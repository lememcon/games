import { describe, expect, it } from "vitest";

import {
  MAX_IMPORT_ENTRIES,
  MAX_PLAYED_COUNT,
  parseBggId,
  parseCount,
  parseImportBody,
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

describe("parseCount", () => {
  it.each([0, 1, 5, MAX_PLAYED_COUNT])("accepts %j", (count) => {
    expect(parseCount({ count })).toEqual({ ok: true, value: count });
  });

  it.each([
    [{ count: -1 }],
    [{ count: MAX_PLAYED_COUNT + 1 }],
    [{ count: 1.5 }],
    [{ count: "3" }],
    [{ count: null }],
    [{ count: NaN }],
    [{}],
    [{ count: 1, extra: true }],
    [{ other: 1 }],
    [[1]],
    [null],
    ["3"],
    [undefined],
  ])("rejects %j", (body) => {
    expect(parseCount(body)).toEqual({ ok: false });
  });
});

describe("parseImportBody", () => {
  it("parses ids and counts into a map", () => {
    expect(parseImportBody({ counts: { "11": 3, "200": 1 } })).toEqual({
      ok: true,
      value: new Map([
        [11, 3],
        [200, 1],
      ]),
    });
  });

  it("accepts an empty import", () => {
    expect(parseImportBody({ counts: {} })).toEqual({
      ok: true,
      value: new Map(),
    });
  });

  it("accepts exactly the maximum number of entries", () => {
    const counts = Object.fromEntries(
      Array.from({ length: MAX_IMPORT_ENTRIES }, (_, i) => [i + 1, 1]),
    );
    expect(parseImportBody({ counts }).ok).toBe(true);
  });

  it("rejects more than the maximum number of entries", () => {
    const counts = Object.fromEntries(
      Array.from({ length: MAX_IMPORT_ENTRIES + 1 }, (_, i) => [i + 1, 1]),
    );
    expect(parseImportBody({ counts })).toEqual({ ok: false });
  });

  it.each([
    [{ counts: { abc: 1 } }],
    [{ counts: { "0": 1 } }],
    [{ counts: { "11": 0 } }],
    [{ counts: { "11": MAX_PLAYED_COUNT + 1 } }],
    [{ counts: { "11": 1.5 } }],
    [{ counts: { "11": "2" } }],
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
