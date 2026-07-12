import { describe, expect, it } from "vitest";

import {
  BRONZE,
  GOLD,
  PALETTE,
  SILVER,
  medalColor,
  paletteColor,
} from "@/lib/colors";

describe("paletteColor", () => {
  it("maps a key to a color from the palette", () => {
    expect(PALETTE).toContain(paletteColor("alice"));
  });

  it("is deterministic for the same key", () => {
    expect(paletteColor("Wingspan")).toBe(paletteColor("Wingspan"));
  });

  it("spreads different keys across more than one color", () => {
    const colors = new Set(
      ["alice", "bob", "carol", "dave", "erin", "frank"].map(paletteColor),
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("medalColor", () => {
  it("returns gold, silver, and bronze for the podium", () => {
    expect(medalColor(1)).toBe(GOLD);
    expect(medalColor(2)).toBe(SILVER);
    expect(medalColor(3)).toBe(BRONZE);
  });

  it("returns undefined below the podium", () => {
    expect(medalColor(4)).toBeUndefined();
  });
});
