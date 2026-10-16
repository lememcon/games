import { append, assoc, dissoc, reduce } from "ramda";

import { apiFetch } from "@/lib/api";
import type { Data, PlayerGameScore } from "@/types";

// The reduce accumulators group score rows by a key; each grouping drops one
// key from the row at runtime (dissoc). @types/ramda cannot express that
// point-free chain precisely, so the accumulator returns are cast back to the
// group type. Consumers still see the precise Data type.
type Group = Record<string, PlayerGameScore[]>;

const build = (rows: PlayerGameScore[]): Data => {
  const max = rows.reduce((m, row) => Math.max(m, row.score), 0);

  const by_id = reduce<PlayerGameScore, Group>(
    (games, score) => {
      const id = `${score.bgg_id}`;
      if (id in games) {
        return assoc(
          id,
          append(dissoc("bgg_id", score), games[id]),
          games,
        ) as Group;
      }

      return assoc(id, [dissoc("bgg_id", score)], games) as Group;
    },
    {},
    rows,
  );
  const by_game = reduce<PlayerGameScore, Group>(
    (games, score) => {
      if (score.game in games) {
        return assoc(
          score.game,
          append(dissoc("game", score), games[score.game]),
          games,
        ) as Group;
      }

      return assoc(score.game, [dissoc("game", score)], games) as Group;
    },
    {},
    rows,
  );
  const by_player = reduce<PlayerGameScore, Group>(
    (players, score) => {
      if (score.player in players) {
        return assoc(
          score.player,
          append(dissoc("player", score), players[score.player]),
          players,
        ) as Group;
      }

      return assoc(score.player, [dissoc("player", score)], players) as Group;
    },
    {},
    rows,
  );

  return { loading: false, scores: rows, by_game, by_player, by_id, max };
};

const fetchScores = async (
  year: string,
  fetchImpl: typeof fetch,
): Promise<Data> => {
  const body = await apiFetch<{ player_game_scores?: PlayerGameScore[] }>(
    `/years/${encodeURIComponent(year)}/scores`,
    {},
    fetchImpl,
  );
  if (!Array.isArray(body?.player_game_scores)) {
    throw new Error("unexpected scores body");
  }
  return build(body.player_game_scores);
};

// One load per year, shared by every hook that asks for it. Keyed by year only:
// the cache serves the global fetch, so a different global fetch for the same
// year still gets the cached data. Consumers must treat the Data as read-only.
// A settled entry expires SCORES_TTL_MS after it resolved, so scores changed
// elsewhere show up on the next load. A pending fetch never expires, so
// concurrent callers share one promise.
export const SCORES_TTL_MS = 5 * 60_000;

type Entry = { promise: Promise<Data>; expires: number };

const cache = new Map<string, Entry>();

export const resetScoresCache = (): void => cache.clear();

// Drop one year, or every year when none is given.
export const invalidateScores = (year?: string | number | null): void => {
  if (year === undefined || year === null) cache.clear();
  else cache.delete(`${year}`);
};

// Loads (and groups) a year's scores. Only the global fetch is cached; an
// injected fetch runs uncached. A failed load is evicted so a retry refetches.
export const load = (year: string, fetchImpl: typeof fetch): Promise<Data> => {
  if (fetchImpl !== globalThis.fetch) return fetchScores(year, fetchImpl);

  const hit = cache.get(year);
  if (hit) {
    if (Date.now() < hit.expires) return hit.promise;
    cache.delete(year);
  }

  const entry: Entry = {
    promise: fetchScores(year, fetchImpl).then(
      (data) => {
        entry.expires = Date.now() + SCORES_TTL_MS;
        return data;
      },
      (e: unknown) => {
        if (cache.get(year) === entry) cache.delete(year);
        throw e;
      },
    ),
    expires: Infinity,
  };
  cache.set(year, entry);
  return entry.promise;
};
