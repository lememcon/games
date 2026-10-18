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
// the shelf just stays hidden. After an import the previous list stays until
// the refetch lands (and is kept if it fails).
const useUnplayedGames = (fetchImpl: typeof fetch = fetch): UnplayedGame[] => {
  const version = useImportVersion();
  const [games, setGames] = useState<UnplayedGame[]>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>("/games/unplayed", {}, fetchImpl)
      .then((body) => {
        const parsed = parseGames(body);
        if (!cancelled) setGames(parsed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // version is the refetch trigger after an import; it is not read here.
  }, [version, fetchImpl]);

  return games;
};

export default useUnplayedGames;
