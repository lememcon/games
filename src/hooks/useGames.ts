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
// part did not load. After an import (in any tab) the previous data stays on
// screen until the refetch lands; a failed refetch keeps it, a failed first
// load reports the error.
const useGames = (fetchImpl: typeof fetch = fetch): GamesState => {
  const version = useImportVersion();
  const [state, setState] = useState<GamesState | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>("/games", {}, fetchImpl)
      .then((body) => {
        if (!isGamesData(body)) throw new Error("unexpected /api/games body");
        return { games: body, loading: false, error: false };
      })
      .catch(() => ({ games: {}, loading: false, error: true }))
      .then((next) => {
        if (!cancelled) setState((prev) => (next.error && prev ? prev : next));
      });
    return () => {
      cancelled = true;
    };
    // version is the refetch trigger after an import; it is not read here.
  }, [version, fetchImpl]);

  return state ?? loadingState;
};

export default useGames;
