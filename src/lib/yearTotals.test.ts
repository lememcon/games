import { describe, expect, it } from "vitest";

import { seriesFor, sparklinePoints } from "@/lib/yearTotals";

describe("seriesFor", () => {
  it("returns one game's totals ascending by year", () => {
    const totals = [
      { year: 2025, bgg_id: 1, total: 5 },
      { year: 2024, bgg_id: 2, total: 9 },
      { year: 2023, bgg_id: 1, total: 3 },
    ];
    expect(seriesFor(totals, 1)).toEqual([
      { year: 2023, total: 3 },
      { year: 2025, total: 5 },
    ]);
    expect(seriesFor(totals, 7)).toEqual([]);
  });
});

describe("sparklinePoints", () => {
  it("scales years across and totals up, inside the margin", () => {
    const series = [
      { year: 2023, total: 0 },
      { year: 2024, total: 10 },
      { year: 2025, total: 5 },
    ];
    expect(sparklinePoints(series, 104, 34)).toBe("2,32 52,2 102,17");
  });

  it("puts a flat series mid-height", () => {
    const series = [
      { year: 2024, total: 4 },
      { year: 2025, total: 4 },
    ];
    expect(sparklinePoints(series, 104, 34)).toBe("2,17 102,17");
  });

  it("does not divide by zero for a single year", () => {
    expect(sparklinePoints([{ year: 2024, total: 4 }], 104, 34)).toBe("2,17");
  });
});
