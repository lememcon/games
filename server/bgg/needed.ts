const DATA_URL = "https://data.lememcon.com";
const FIRST_YEAR = 2025;
const CACHE_MS = 60_000;

/** BGG ids fit a Postgres int4; reject anything else before it reaches SQL. */
const BGG_ID = /^\d{1,9}$/;

export const MAX_DOWNLOAD_IDS = 500;

export interface NeededGame {
  bggId: number;
  name: string;
  /** Score years the game appears in, ascending. */
  years: number[];
}

export class ScoresUnavailableError extends Error {
  constructor() {
    super("scores_unavailable");
    this.name = "ScoresUnavailableError";
  }
}

export const toBggId = (value: unknown): number | null =>
  (typeof value === "string" || typeof value === "number") &&
  BGG_ID.test(String(value))
    ? Number(value) || null
    : null;

/** Validates and dedupes a client-supplied id list; null when it is not acceptable. */
export function normalizeIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ids = new Set<number>();
  for (const value of raw) {
    const id = toBggId(value);
    if (id === null) return null;
    ids.add(id);
  }
  return ids.size <= MAX_DOWNLOAD_IDS ? [...ids] : null;
}

interface YearScores {
  player_game_scores?: { bgg_id?: unknown; game?: unknown }[];
}

/**
 * Games the score feeds reference, unioned across every year from 2025 to now.
 * `fetch`, `now` and `timeoutMs` are injected; results are cached for ~60 s so repeated
 * status requests do not hit data.lememcon.com.
 */
export function createNeededIds(
  deps: { fetch?: typeof fetch; now?: () => number; timeoutMs?: number } = {},
): () => Promise<NeededGame[]> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? 15_000;
  let cached: { at: number; games: NeededGame[] } | null = null;
  let inflight: Promise<NeededGame[]> | null = null;

  const loadYear = async (year: number): Promise<YearScores> => {
    let res: Response;
    try {
      res = await doFetch(`${DATA_URL}/${year}.json`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ScoresUnavailableError();
    }
    // A year that has no file yet simply contributes nothing.
    if (res.status === 404) return {};
    if (!res.ok) throw new ScoresUnavailableError();
    try {
      return (await res.json()) as YearScores;
    } catch {
      throw new ScoresUnavailableError();
    }
  };

  const load = async (): Promise<NeededGame[]> => {
    const last = new Date(now()).getFullYear();
    const years = Array.from(
      { length: Math.max(0, last - FIRST_YEAR + 1) },
      (_, i) => FIRST_YEAR + i,
    );
    const feeds = await Promise.all(years.map(loadYear));
    const byId = new Map<number, NeededGame>();
    feeds.forEach((feed, i) => {
      for (const row of feed.player_game_scores ?? []) {
        const bggId = toBggId(row.bgg_id);
        if (bggId === null) continue;
        const game = byId.get(bggId) ?? {
          bggId,
          name: typeof row.game === "string" ? row.game : `#${bggId}`,
          years: [],
        };
        if (!game.years.includes(years[i])) game.years.push(years[i]);
        byId.set(bggId, game);
      }
    });
    return [...byId.values()].sort((a, b) => a.bggId - b.bggId);
  };

  return async () => {
    if (cached && now() - cached.at < CACHE_MS) return cached.games;
    inflight ??= load()
      .then((games) => {
        cached = { at: now(), games };
        return games;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}
