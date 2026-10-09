import { describe, expect, it } from "vitest";

import { parseDisplayName } from "./profile";

const ok = (value: string | null) => ({ ok: true, value });
const name = (displayName: unknown) => parseDisplayName({ displayName });

describe("parseDisplayName", () => {
  it.each([
    [{ displayName: "Kel" }, ok("Kel")],
    [{ displayName: null }, ok(null)],
    [{ displayName: "" }, ok(null)],
    [{ displayName: "   " }, ok(null)],
    [{ displayName: "  Kel   the  Great " }, ok("Kel the Great")],
    [{ displayName: " Kel　Z " }, ok("Kel Z")],
    [{ displayName: "Ｋｅｌ" }, ok("Kel")],
    [{ displayName: "ﬁn" }, ok("fin")],
  ])("accepts %j", (body, expected) => {
    expect(parseDisplayName(body)).toEqual(expected);
  });

  it.each([
    ["not an object", "Kel"],
    ["null", null],
    ["an array", [{ displayName: "Kel" }]],
    ["a missing key", {}],
    ["an extra key", { displayName: "Kel", role: "admin" }],
    ["another key", { name: "Kel" }],
    ["a number", { displayName: 5 }],
    ["undefined", { displayName: undefined }],
  ])("rejects %s as invalid_body", (_label, body) => {
    expect(parseDisplayName(body)).toEqual({
      ok: false,
      error: "invalid_body",
    });
  });

  it.each([
    ["a control character", "Ke\u0000l"],
    ["a newline", "Kel\nZ"],
    ["a tab", "Kel\tZ"],
    ["a zero-width space", "Ke​l"],
    ["a bidi override", "‮Kel"],
    ["a bidi isolate", "Kel⁦"],
    ["a line separator", "Kel Z"],
    ["a paragraph separator", "Kel Z"],
    ["a soft hyphen", "Ke­l"],
    ["a combining grapheme joiner", "Ke\u034Fl"],
    ["a variation selector", "Kel\uFE0F"],
    ["a Hangul filler", "Kel\u3164"],
    ["a Braille blank", "\u2800"],
    ["a leading combining mark", "\u0300Kel"],
    ["no letter or digit", "!!!"],
    ["a private-use character", "Kel\uE000"],
    ["33 characters", "a".repeat(33)],
  ])("rejects %s as invalid_name", (_label, value) => {
    expect(name(value)).toEqual({ ok: false, error: "invalid_name" });
  });

  it("counts code points, not UTF-16 units", () => {
    expect(name("\u{20000}".repeat(32))).toEqual(ok("\u{20000}".repeat(32)));
    expect(name("\u{20000}".repeat(33))).toEqual({
      ok: false,
      error: "invalid_name",
    });
  });

  it("rejects a name made only of emoji", () => {
    expect(name("\u{1f600}")).toEqual({ ok: false, error: "invalid_name" });
  });

  it("measures the length after normalizing and trimming", () => {
    expect(name(` ${"a".repeat(32)} `)).toEqual(ok("a".repeat(32)));
  });
});
