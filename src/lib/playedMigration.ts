// One-time move of played games from the old per-browser localStorage key (which
// stored play counts) to the server. Pure apart from the storage it is handed.

export const legacyKey = (year: string) => `played_counts_${year}`;

export const clearLegacyCounts = (year: string): void => {
  try {
    localStorage.removeItem(legacyKey(year));
  } catch {
    // Storage unavailable: nothing to clear.
  }
};

/**
 * The importable played ids stored for the year: ids that are positive integers
 * with a legacy count above zero; anything else is dropped. Null when nothing
 * usable is stored; unusable data is cleared so it is not examined again.
 */
export const readLegacyPlayed = (year: string): string[] | null => {
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

  const ids: string[] = [];
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    for (const [id, count] of Object.entries(parsed)) {
      if (
        /^[1-9]\d{0,9}$/.test(id) &&
        Number(id) <= 2147483647 &&
        typeof count === "number" &&
        Number.isInteger(count) &&
        count >= 1
      )
        ids.push(id);
    }
  }

  if (ids.length === 0) {
    clearLegacyCounts(year);
    return null;
  }
  return ids;
};
