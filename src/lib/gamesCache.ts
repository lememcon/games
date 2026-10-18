import { apiFetch } from "@/lib/api";
import type { GamesData } from "@/types";

const isGamesData = (body: unknown): body is GamesData =>
  typeof body === "object" && body !== null && !Array.isArray(body);

const fetchGames = async (fetchImpl: typeof fetch): Promise<GamesData> => {
  const body = await apiFetch<unknown>("/games", {}, fetchImpl);
  if (!isGamesData(body)) throw new Error("unexpected /api/games body");
  return body;
};

// One load shared by every hook that asks for the same import version. A
// settled entry expires GAMES_TTL_MS after it resolved; a pending fetch never
// expires, so concurrent callers share one promise. Consumers must treat the
// GamesData as read-only.
export const GAMES_TTL_MS = 5 * 60_000;

type Entry = { version: number; promise: Promise<GamesData>; expires: number };

let entry: Entry | null = null;

export const resetGamesCache = (): void => {
  entry = null;
};

// Loads the games map. Only the global fetch is cached; an injected fetch runs
// uncached. A failed load is evicted so a retry refetches. A newer version
// replaces the entry; a lagging older version runs uncached and leaves it.
export const loadGames = (
  version: number,
  fetchImpl: typeof fetch,
): Promise<GamesData> => {
  if (fetchImpl !== globalThis.fetch) return fetchGames(fetchImpl);

  if (entry) {
    if (version === entry.version && Date.now() < entry.expires) {
      return entry.promise;
    }
    if (version < entry.version) return fetchGames(fetchImpl);
  }

  const mine: Entry = {
    version,
    promise: fetchGames(fetchImpl).then(
      (data) => {
        mine.expires = Date.now() + GAMES_TTL_MS;
        return data;
      },
      (e: unknown) => {
        if (entry === mine) entry = null;
        throw e;
      },
    ),
    expires: Infinity,
  };
  entry = mine;
  return mine.promise;
};
