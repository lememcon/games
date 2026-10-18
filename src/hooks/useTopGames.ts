import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useImportVersion } from "@/lib/scoresSync";

interface TopGamesState {
  /** Game ids (as strings) of the member's best scores, best first. */
  ids: string[];
  loading: boolean;
  error: boolean;
}

const pending: TopGamesState = { ids: [], loading: true, error: false };

const parseIds = (body: unknown): string[] => {
  const games = (body as { games?: unknown } | null)?.games;
  if (
    !Array.isArray(games) ||
    !games.every(
      (g) => !!g && Number.isInteger((g as { bgg_id?: unknown }).bgg_id),
    )
  ) {
    throw new Error("unexpected /api/me/top-games body");
  }
  return games.map((g) => `${(g as { bgg_id: number }).bgg_id}`);
};

// The signed-in member's ten highest scores in a year. A null or empty year (not
// known yet) fetches nothing and stays loading. State is tagged with the year
// it belongs to, so a response for a superseded year is dropped and another
// year's data is never shown. After an import the previous data for the same
// year stays until the refetch lands; a failed refetch keeps it.
const useTopGames = (
  year: string | null,
  fetchImpl: typeof fetch = fetch,
): TopGamesState => {
  const version = useImportVersion();
  const [result, setResult] = useState<{
    year: string;
    state: TopGamesState;
  } | null>(null);

  useEffect(() => {
    if (!year) return;
    let cancelled = false;

    apiFetch<unknown>(
      `/me/top-games?year=${encodeURIComponent(year)}`,
      {},
      fetchImpl,
    )
      .then((body) => ({
        ids: parseIds(body),
        loading: false,
        error: false,
      }))
      .catch(() => ({ ids: [], loading: false, error: true }))
      .then((state) => {
        if (cancelled) return;
        setResult((prev) =>
          state.error && prev?.year === year ? prev : { year, state },
        );
      });

    return () => {
      cancelled = true;
    };
    // version is the refetch trigger after an import; it is not read here.
  }, [year, version, fetchImpl]);

  return year && result?.year === year ? result.state : pending;
};

export default useTopGames;
