import { describe, expect, it } from "vitest";

import {
  MAX_DISPLAY_NAME,
  displayNameError,
  groupYearVetoes,
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

describe("groupYearVetoes", () => {
  it("groups by year, newest first, keeping row order", () => {
    const rows = [
      { year: 2025, bggId: 1, name: "Root" },
      { year: 2026, bggId: 3, name: "Azul" },
      { year: 2025, bggId: 2, name: null },
      { year: 2026, bggId: 4, name: "Brass" },
    ];
    expect(groupYearVetoes(rows)).toEqual([
      { year: 2026, vetoes: [rows[1], rows[3]] },
      { year: 2025, vetoes: [rows[0], rows[2]] },
    ]);
  });

  it("is empty without rows", () => {
    expect(groupYearVetoes([])).toEqual([]);
  });
});
