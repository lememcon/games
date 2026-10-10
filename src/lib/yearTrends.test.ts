import { describe, expect, it } from "vitest";

import { returningFavorites, risingGames } from "@/lib/yearTrends";
import type { YearTotal } from "@/types";

const t = (bgg_id: number, year: number, total: number): YearTotal => ({
  bgg_id,
  year,
  total,
});

describe("returningFavorites", () => {
  const totals = [
    t(1, 2023, 90),
    t(1, 2026, 40), // returns after a gap
    t(2, 2024, 90),
    t(2, 2026, 10), // same peak, later year
    t(3, 2024, 50),
    t(3, 2026, 5),
    t(4, 2025, 80),
    t(4, 2026, 80), // played last year too: not returning
    t(5, 2026, 70), // new this year
    t(6, 2023, 99), // absent this year
    t(7, 2022, 0),
    t(7, 2026, 9), // earlier year had no score
  ];

  it("ranks games that skipped last year by their earlier peak", () => {
    expect(returningFavorites(totals, 2026).map((r) => r.bggId)).toEqual([
      1, 2, 3,
    ]);
    expect(returningFavorites(totals, 2026)[0]).toEqual({
      bggId: 1,
      total: 40,
      peak: 90,
      peakYear: 2023,
    });
  });

  it("breaks full ties by lowest id and honours the limit", () => {
    const tied = [
      t(9, 2020, 5),
      t(9, 2026, 1),
      t(8, 2020, 5),
      t(8, 2026, 1),
      t(99, 2025, 1),
    ];
    expect(returningFavorites(tied, 2026).map((r) => r.bggId)).toEqual([8, 9]);
    expect(returningFavorites(tied, 2026, 1)).toHaveLength(1);
  });

  it("picks the earliest year when an equal peak repeats", () => {
    const rows = [t(1, 2020, 5), t(1, 2021, 5), t(1, 2026, 1), t(99, 2025, 1)];
    expect(returningFavorites(rows, 2026)[0].peakYear).toBe(2020);
  });

  it("is empty with no data", () => {
    expect(returningFavorites([], 2026)).toEqual([]);
  });

  it("uses the previous held year when there is a gap", () => {
    const rows = [
      t(1, 2020, 50),
      t(1, 2024, 5),
      t(1, 2026, 9), // played in 2024, the previous held year
      t(2, 2020, 40),
      t(2, 2026, 8), // skipped 2024
      t(3, 2024, 1),
    ];
    expect(returningFavorites(rows, 2026).map((r) => r.bggId)).toEqual([2]);
  });

  it("filters before applying the limit", () => {
    const rows = [1, 2, 3]
      .flatMap((id) => [t(id, 2020, 10 - id), t(id, 2026, 1)])
      .concat(t(99, 2025, 1));
    expect(
      returningFavorites(rows, 2026, 1, (id) => id === 3).map((r) => r.bggId),
    ).toEqual([3]);
  });

  it("treats a zero total as not scored", () => {
    const rows = [
      t(1, 2020, 5),
      t(1, 2025, 0),
      t(1, 2026, 3),
      t(2, 2026, 0),
      t(99, 2025, 1),
    ];
    expect(returningFavorites(rows, 2026).map((r) => r.bggId)).toEqual([1]);
  });
});

describe("risingGames", () => {
  const totals = [
    t(1, 2025, 10),
    t(1, 2026, 40), // +30
    t(2, 2025, 50),
    t(2, 2026, 70), // +20
    t(3, 2025, 10),
    t(3, 2026, 30), // +20, lower total than 2
    t(4, 2025, 60),
    t(4, 2026, 20), // fell
    t(5, 2026, 99), // new
    t(6, 2025, 30), // dropped out
    t(7, 2025, 5),
    t(7, 2026, 5), // flat
  ];

  it("ranks by growth, then this year's total, then id", () => {
    expect(risingGames(totals, 2026)).toEqual([
      { bggId: 1, total: 40, previous: 10, delta: 30 },
      { bggId: 2, total: 70, previous: 50, delta: 20 },
      { bggId: 3, total: 30, previous: 10, delta: 20 },
    ]);
  });

  it("breaks full ties by lowest id and honours the limit", () => {
    const tied = [t(9, 2025, 1), t(9, 2026, 2), t(8, 2025, 1), t(8, 2026, 2)];
    expect(risingGames(tied, 2026).map((r) => r.bggId)).toEqual([8, 9]);
    expect(risingGames(totals, 2026, 2)).toHaveLength(2);
  });

  it("sums duplicate rows for a game and year", () => {
    const rows = [t(1, 2025, 5), t(1, 2026, 3), t(1, 2026, 4)];
    expect(risingGames(rows, 2026)[0].total).toBe(7);
  });

  it("uses the previous held year when there is a gap", () => {
    const rows = [t(1, 2024, 5), t(1, 2026, 9), t(2, 2025, 1), t(3, 2023, 1)];
    expect(risingGames(rows, 2026)).toEqual([]);
    const held = [t(1, 2023, 5), t(1, 2026, 9), t(2, 2023, 1)];
    expect(risingGames(held, 2026)).toEqual([
      { bggId: 1, total: 9, previous: 5, delta: 4 },
    ]);
  });

  it("filters before applying the limit", () => {
    const rows = [1, 2, 3].flatMap((id) => [
      t(id, 2025, 1),
      t(id, 2026, 5 + id),
    ]);
    expect(
      risingGames(rows, 2026, 1, (id) => id === 1).map((r) => r.bggId),
    ).toEqual([1]);
  });

  it("treats a zero total as not scored", () => {
    const rows = [t(1, 2025, 0), t(1, 2026, 3), t(2, 2025, 1), t(2, 2026, 0)];
    expect(risingGames(rows, 2026)).toEqual([]);
  });
});
