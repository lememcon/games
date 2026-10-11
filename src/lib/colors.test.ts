import { describe, expect, it } from "vitest";

import {
  BRONZE,
  GOLD,
  PALETTE,
  SILVER,
  buildPlayerColors,
  medalColor,
  pickedColors,
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

describe("buildPlayerColors with picks", () => {
  const names = ["alice", "bob", "carol", "dave"];
  const base = buildPlayerColors(names);

  it("equals the old output when nothing is picked", () => {
    expect(buildPlayerColors(names, {})).toEqual(base);
  });

  it("keeps a pick and changes no one else's color", () => {
    const colors = buildPlayerColors(names, { bob: PALETTE[4] });
    expect(colors.bob).toBe(PALETTE[4]);
    expect({ ...colors, bob: base.bob }).toEqual(base);
  });

  it("allows duplicate colors", () => {
    const colors = buildPlayerColors(names, { bob: base.alice });
    expect(colors.bob).toBe(colors.alice);
  });

  it("ignores picks for names that are not in the list", () => {
    expect(buildPlayerColors(names, { zed: PALETTE[1] })).toEqual(base);
  });
});

describe("pickedColors", () => {
  it("maps each player to the color on their rows", () => {
    expect(
      pickedColors({
        alice: [{}, { color: "#2F6BB8" }],
        bob: [{}],
        carol: [],
      }),
    ).toEqual({ alice: "#2F6BB8" });
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
