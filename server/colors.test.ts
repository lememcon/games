import { describe, expect, it } from "vitest";

// The one place server code touches src/: a drift check, not a runtime import.
import { PALETTE } from "../src/lib/colors";
import { PLAYER_COLORS, parseColor } from "./colors";

describe("PLAYER_COLORS", () => {
  it("equals the client PALETTE", () => {
    expect([...PLAYER_COLORS]).toEqual(PALETTE);
  });
});

describe("parseColor", () => {
  it.each(PALETTE)("accepts %s", (hex) => {
    expect(parseColor({ color: hex })).toEqual({ ok: true, value: hex });
  });

  it("accepts null to clear", () => {
    expect(parseColor({ color: null })).toEqual({ ok: true, value: null });
  });

  it.each(["#000000", "#c4402c", "red", ""])("rejects %j", (color) => {
    expect(parseColor({ color })).toEqual({
      ok: false,
      error: "invalid_color",
    });
  });

  it.each([5, true, {}, ["#C4402C"]])("rejects non-string %j", (color) => {
    expect(parseColor({ color })).toEqual({ ok: false, error: "invalid_body" });
  });

  it.each([null, "x", [], {}, { color: null, extra: 1 }, { other: null }])(
    "rejects body %j",
    (body) => {
      expect(parseColor(body)).toEqual({ ok: false, error: "invalid_body" });
    },
  );
});
