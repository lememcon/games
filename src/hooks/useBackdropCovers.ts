import { useMemo } from "react";

import useCovers from "@/hooks/useCovers";
import useTopGames from "@/hooks/useTopGames";
import useYearTotals from "@/hooks/useYearTotals";
import useYears from "@/hooks/useYears";
import { buildCoverPool } from "@/lib/floaters";
import { defaultYear, routeYear } from "@/lib/routes";

// The year the scoreboard last showed. Read fresh (not via useLocalState, which
// reads once) so a year chosen after this hook mounted is not missed.
const readStoredYear = (): string => {
  try {
    const value = localStorage.getItem("year");
    const parsed: unknown = value ? JSON.parse(value) : "";
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return "";
  }
};

export interface BackdropCovers {
  /** BGG ids the backdrop may draw from. */
  pool: string[];
  /** BGG ids to show first: the player's top scores that year. */
  preferred: string[];
  /** Cover URL by BGG id. */
  covers: Record<string, string>;
}

/**
 * The covers for the backdrop behind signed-in pages. On a year page only
 * games scored that year are eligible; the player's ten highest raw scores that
 * year are preferred. Any other page draws from every cover, preferring the
 * saved (or latest) year's top scores. While loading, or on error, a year page
 * has no covers; any other page keeps every cover and prefers none.
 */
const useBackdropCovers = (
  pathname: string,
  fetchImpl: typeof fetch = fetch,
): BackdropCovers => {
  const { years } = useYears(fetchImpl);
  const pathYear = routeYear(pathname);
  const year = defaultYear(years, readStoredYear(), pathYear);
  const top = useTopGames(year, fetchImpl);
  const totals = useYearTotals(fetchImpl);
  const covers = useCovers(fetchImpl);

  const ready = !top.loading && !top.error && !totals.loading && !totals.error;
  // Until a year page's scores arrive, which games it has is unknown.
  const unknown = pathYear !== null && !ready;
  // Keys, not the data object, so a refetch with the same games changes nothing.
  const allowedKey =
    ready && pathYear !== null
      ? [
          ...new Set(
            totals.totals
              .filter((t) => `${t.year}` === pathYear)
              .map((t) => `${t.bgg_id}`),
          ),
        ]
          .sort()
          .join(",")
      : null;
  const preferredKey = ready ? top.ids.join(",") : "";

  return useMemo(() => {
    if (unknown) return { pool: [], preferred: [], covers };
    const allowed =
      allowedKey === null
        ? null
        : new Set(allowedKey.split(",").filter(Boolean));
    const pool = buildCoverPool(Object.keys(covers), allowed);
    const inPool = new Set(pool);
    const preferred = preferredKey.split(",").filter((id) => inPool.has(id));
    return { pool, preferred, covers };
  }, [unknown, allowedKey, preferredKey, covers]);
};

export default useBackdropCovers;
