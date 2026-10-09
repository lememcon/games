import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { GamesData } from "@/types";

interface GamesState {
  games: GamesData;
  loading: boolean;
  error: boolean;
}

const isGamesData = (body: unknown): body is GamesData =>
  typeof body === "object" && body !== null && !Array.isArray(body);

// Game metadata (player bounds, images) for every game, keyed by BGG id. A
// failure is reported separately from the scores so the app can say which
// part did not load.
const useGames = (fetchImpl: typeof fetch = fetch): GamesState => {
  const [state, setState] = useState<GamesState>({
    games: {},
    loading: true,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>("/games", {}, fetchImpl)
      .then((body) => {
        if (!isGamesData(body)) throw new Error("unexpected /api/games body");
        return { games: body, loading: false, error: false };
      })
      .catch(() => ({ games: {}, loading: false, error: true }))
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  return state;
};

export default useGames;
