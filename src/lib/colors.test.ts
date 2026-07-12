import { describe, expect, it } from "vitest";

import {
  BRONZE,
  GOLD,
  PALETTE,
  SILVER,
  buildPlayerColors,
  medalColor,
} from "@/lib/colors";

describe("buildPlayerColors", () => {
  it("assigns palette colors in case-insensitive sorted order", () => {
    expect(buildPlayerColors(["carol", "Alice", "bob"])).toEqual({
      Alice: PALETTE[0],
      bob: PALETTE[1],
      carol: PALETTE[2],
    });
  });

  it("wraps around the palette when there are more players than colors", () => {
    const names = ["a", "b", "c", "d", "e", "f"]; // 6 names, 5 colors
    const colors = buildPlayerColors(names);
    expect(colors.a).toBe(PALETTE[0]);
    expect(colors.f).toBe(PALETTE[5 % PALETTE.length]); // wraps to PALETTE[0]
  });

  it("does not mutate the input array", () => {
    const names = ["carol", "Alice", "bob"];
    buildPlayerColors(names);
    expect(names).toEqual(["carol", "Alice", "bob"]);
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
