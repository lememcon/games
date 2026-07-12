import { describe, expect, it } from "vitest";

import { DEFAULT_THEME } from "@mantine/core";

import { normalized_score, score_color, score_icon, score_label } from "@/util";

describe("normalized_score", () => {
  it("scales a raw score against the max as a percentage", () => {
    expect(normalized_score(50, 100)).toBe(50);
    expect(normalized_score(1, 3)).toBe(33.33);
  });
});

describe("score_label", () => {
  it("names each score band", () => {
    expect(score_label(90)).toBe("Great");
    expect(score_label(70)).toBe("Good");
    expect(score_label(50)).toBe("Even");
    expect(score_label(30)).toBe("Low");
    expect(score_label(10)).toBe("Poor");
  });
});

describe("score_icon", () => {
  it("picks a distinct icon per band", () => {
    const icons = [90, 70, 50, 30, 10].map(score_icon);
    expect(new Set(icons).size).toBe(5);
  });
});

describe("score_color", () => {
  it("uses green, yellow, and red for high, mid, and low scores", () => {
    expect(score_color(DEFAULT_THEME, 90)).toBe(DEFAULT_THEME.colors.green[7]);
    expect(score_color(DEFAULT_THEME, 50)).toBe(DEFAULT_THEME.colors.yellow[8]);
    expect(score_color(DEFAULT_THEME, 10)).toBe(DEFAULT_THEME.colors.red[7]);
  });
});
