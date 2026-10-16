import { useMemo } from "react";

import useData from "@/hooks/useData";
import useYears from "@/hooks/useYears";
import { buildCoverPool, coverId, topScoreIds } from "@/lib/floaters";
import images from "@/lib/images";
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
  /** Cover keys (image paths) the backdrop may draw from. */
  pool: string[];
  /** Cover keys to show first: the player's top scores that year. */
  preferred: string[];
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
  discordId: string,
  fetchImpl: typeof fetch = fetch,
): BackdropCovers => {
  const { years } = useYears(fetchImpl);
  const pathYear = routeYear(pathname);
  const year = defaultYear(years, readStoredYear(), pathYear);
  const data = useData(year, fetchImpl);

  const ready = !data.loading && !data.error;
  // Until a year page's scores arrive, which games it has is unknown.
  const unknown = pathYear !== null && !ready;
  // Keys, not the data object, so a refetch with the same games changes nothing.
  const allowedKey =
    ready && pathYear !== null
      ? [...new Set(data.scores.map((row) => `${row.bgg_id}`))].sort().join(",")
      : null;
  const preferredKey = ready
    ? topScoreIds(data.scores, discordId).join(",")
    : "";

  return useMemo(() => {
    if (unknown) return { pool: [], preferred: [] };
    const allowed =
      allowedKey === null
        ? null
        : new Set(allowedKey.split(",").filter(Boolean));
    const keys = Object.keys(images);
    const pool = buildCoverPool(keys, allowed);
    const byId = new Map(pool.map((key) => [coverId(key), key]));
    const preferred = preferredKey
      .split(",")
      .filter(Boolean)
      .flatMap((id) => byId.get(id) ?? []);
    return { pool, preferred };
  }, [unknown, allowedKey, preferredKey]);
};

export default useBackdropCovers;
