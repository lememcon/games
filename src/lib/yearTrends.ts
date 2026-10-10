import type { YearTotal } from "@/types";

export const TREND_LIMIT = 5;

export interface ReturningFavorite {
  bggId: number;
  // The game's total in the selected year.
  total: number;
  // Its best total in any year before the one it skipped.
  peak: number;
  peakYear: number;
}

export interface RisingGame {
  bggId: number;
  total: number;
  previous: number;
  // total - previous, always positive.
  delta: number;
}

const totalsByGame = (
  totals: YearTotal[],
): Map<number, Map<number, number>> => {
  const byGame = new Map<number, Map<number, number>>();
  for (const { bgg_id, year, total } of totals) {
    const years = byGame.get(bgg_id) ?? new Map<number, number>();
    years.set(year, (years.get(year) ?? 0) + total);
    byGame.set(bgg_id, years);
  }
  return byGame;
};

// Returning favorites: games scored in `year` that were missing the year
// before but did score in an earlier one. Ranked by their best earlier total
// (earliest peak year, then lowest id, break ties).
export const returningFavorites = (
  totals: YearTotal[],
  year: number,
  limit = TREND_LIMIT,
): ReturningFavorite[] => {
  const found: ReturningFavorite[] = [];
  for (const [bggId, years] of totalsByGame(totals)) {
    const total = years.get(year);
    if (total === undefined || years.has(year - 1)) continue;
    let best: { peak: number; peakYear: number } | null = null;
    for (const [y, t] of years) {
      if (y >= year || t <= 0) continue;
      if (!best || t > best.peak || (t === best.peak && y < best.peakYear)) {
        best = { peak: t, peakYear: y };
      }
    }
    if (best) found.push({ bggId, total, ...best });
  }
  return found
    .sort(
      (a, b) => b.peak - a.peak || a.peakYear - b.peakYear || a.bggId - b.bggId,
    )
    .slice(0, limit);
};

// Rising games: games scored in both `year` and the year before, ranked by how
// much their total grew (then by this year's total, then lowest id).
export const risingGames = (
  totals: YearTotal[],
  year: number,
  limit = TREND_LIMIT,
): RisingGame[] => {
  const found: RisingGame[] = [];
  for (const [bggId, years] of totalsByGame(totals)) {
    const total = years.get(year);
    const previous = years.get(year - 1);
    if (total === undefined || previous === undefined) continue;
    if (total > previous) {
      found.push({ bggId, total, previous, delta: total - previous });
    }
  }
  return found
    .sort((a, b) => b.delta - a.delta || b.total - a.total || a.bggId - b.bggId)
    .slice(0, limit);
};
