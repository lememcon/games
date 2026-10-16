import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useImportVersion } from "@/lib/scoresSync";
import type { GamesData } from "@/types";

export interface GamesState {
  games: GamesData;
  loading: boolean;
  error: boolean;
}

const isGamesData = (body: unknown): body is GamesData =>
  typeof body === "object" && body !== null && !Array.isArray(body);

const loadingState: GamesState = { games: {}, loading: true, error: false };

// Game metadata (player bounds, images) for every game, keyed by BGG id. A
// failure is reported separately from the scores so the app can say which
// part did not load. State is tagged with the import version it belongs to,
// so after an import (in any tab) it reads as loading until the refetch lands.
const useGames = (fetchImpl: typeof fetch = fetch): GamesState => {
  const version = useImportVersion();
  const [state, setState] = useState<{
    version: number;
    value: GamesState;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>("/games", {}, fetchImpl)
      .then((body) => {
        if (!isGamesData(body)) throw new Error("unexpected /api/games body");
        return { games: body, loading: false, error: false };
      })
      .catch(() => ({ games: {}, loading: false, error: true }))
      .then((next) => {
        if (!cancelled) setState({ version, value: next });
      });
    return () => {
      cancelled = true;
    };
  }, [version, fetchImpl]);

  return state?.version === version ? state.value : loadingState;
};

export default useGames;
