import { useEffect, useState } from "react";

import { loadGames } from "@/lib/gamesCache";
import { useImportVersion } from "@/lib/scoresSync";
import type { GamesData } from "@/types";

export interface GamesState {
  games: GamesData;
  loading: boolean;
  error: boolean;
}

const loadingState: GamesState = { games: {}, loading: true, error: false };

// Game metadata (player bounds, images) for every game, keyed by BGG id. A
// failure is reported separately from the scores so the app can say which
// part did not load. After an import (in any tab) the previous data stays on
// screen until the refetch lands; a failed refetch keeps it, a failed first
// load reports the error. Every instance on the global fetch shares one
// /api/games request per import version (see lib/gamesCache).
const useGames = (fetchImpl: typeof fetch = fetch): GamesState => {
  const version = useImportVersion();
  const [state, setState] = useState<GamesState | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGames(version, fetchImpl)
      .then((games): GamesState => ({ games, loading: false, error: false }))
      .catch((): GamesState => ({ games: {}, loading: false, error: true }))
      .then((next) => {
        if (!cancelled) setState((prev) => (next.error && prev ? prev : next));
      });
    return () => {
      cancelled = true;
    };
  }, [version, fetchImpl]);

  return state ?? loadingState;
};

export default useGames;
