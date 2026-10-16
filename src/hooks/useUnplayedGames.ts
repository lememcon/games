import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useImportVersion } from "@/lib/scoresSync";
import type { UnplayedGame } from "@/types";

const EMPTY: UnplayedGame[] = [];

const isGame = (g: unknown): g is UnplayedGame => {
  const r = g as Record<string, unknown> | null;
  return !!r && Number.isInteger(r.bgg_id) && typeof r.name === "string";
};

const parseGames = (body: unknown): UnplayedGame[] => {
  const games = (body as { games?: unknown } | null)?.games;
  if (!Array.isArray(games) || !games.every(isGame)) {
    throw new Error("unexpected /api/games/unplayed body");
  }
  return games;
};

// Games with no scores in any year, for the never-played shelf. Approved
// members only (the API refuses others). A failure leaves the list empty so
// the shelf just stays hidden. State is tagged with the import version it
// belongs to, so after an import the list is empty until the refetch lands
// (and stays empty if it fails).
const useUnplayedGames = (fetchImpl: typeof fetch = fetch): UnplayedGame[] => {
  const version = useImportVersion();
  const [state, setState] = useState<{
    version: number;
    games: UnplayedGame[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>("/games/unplayed", {}, fetchImpl)
      .then((body) => {
        const parsed = parseGames(body);
        if (!cancelled) setState({ version, games: parsed });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version, fetchImpl]);

  return state?.version === version ? state.games : EMPTY;
};

export default useUnplayedGames;
