import { describe, expect, it } from "vitest";

import {
  MAX_DISPLAY_NAME,
  displayNameError,
  formatAvgRank,
  formatWinRate,
  ordinal,
} from "@/lib/profile";

describe("displayNameError", () => {
  it("accepts blank, short and maximum-length names", () => {
    expect(displayNameError("")).toBeNull();
    expect(displayNameError("  Kel ")).toBeNull();
    expect(displayNameError("a".repeat(MAX_DISPLAY_NAME))).toBeNull();
  });

  it("rejects names over the limit", () => {
    expect(displayNameError("a".repeat(MAX_DISPLAY_NAME + 1))).toMatch(/32/);
  });

  it("counts code points, not UTF-16 units", () => {
    expect(displayNameError("😀".repeat(MAX_DISPLAY_NAME))).toBeNull();
  });
});

describe("formatters", () => {
  it("formats win rate and average rank", () => {
    expect(formatWinRate(0.2619)).toBe("26%");
    expect(formatAvgRank(2.44)).toBe("2.4");
  });

  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [112, "112th"],
  ])("writes %i as %s", (n, text) => {
    expect(ordinal(n)).toBe(text);
  });
});
