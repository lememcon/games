// One-time move of played counts from the old per-browser localStorage key to
// the server. Pure apart from the storage it is handed.

import type { PlayedCountsResponse } from "@/types";

// The server's upper bound for one game's count (server/played.ts).
export const MAX_PLAYED_COUNT = 999;

export const legacyKey = (year: string) => `played_counts_${year}`;

export const clearLegacyCounts = (year: string): void => {
  try {
    localStorage.removeItem(legacyKey(year));
  } catch {
    // Storage unavailable: nothing to clear.
  }
};

/**
 * The importable counts stored for the year: ids that are positive integers and
 * counts clamped to 1..999; anything else is dropped. Null when nothing usable
 * is stored; unusable data is cleared so it is not examined again.
 */
export const readLegacyCounts = (
  year: string,
): PlayedCountsResponse["counts"] | null => {
  let raw: string | null;
  try {
    raw = localStorage.getItem(legacyKey(year));
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const counts: PlayedCountsResponse["counts"] = {};
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    for (const [id, count] of Object.entries(parsed)) {
      if (
        /^[1-9]\d{0,9}$/.test(id) &&
        Number(id) <= 2147483647 &&
        typeof count === "number" &&
        Number.isInteger(count) &&
        count >= 1
      )
        counts[id] = Math.min(count, MAX_PLAYED_COUNT);
    }
  }

  if (Object.keys(counts).length === 0) {
    clearLegacyCounts(year);
    return null;
  }
  return counts;
};
