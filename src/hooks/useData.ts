import { useEffect, useState } from "react";

import { append, assoc, dissoc, reduce } from "ramda";

import { apiFetch } from "@/lib/api";
import type { Data, PlayerGameScore } from "@/types";

// The reduce accumulators group score rows by a key; each grouping drops one
// key from the row at runtime (dissoc). @types/ramda cannot express that
// point-free chain precisely, so the accumulator returns are cast back to the
// group type. Consumers still see the precise Data type from this hook.
type Group = Record<string, PlayerGameScore[]>;

const pending: Data = {
  loading: true,
  scores: [],
  by_game: {},
  by_player: {},
  by_id: {},
  max: 0,
};

const failed: Data = { ...pending, loading: false, error: true };

const build = (rows: PlayerGameScore[]): Data => {
  let max = 0;

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

      max = Math.max(max, score.score);
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

// Scores for one year. A null year (not known yet) fetches nothing and stays
// loading. State is tagged with the year it belongs to, so a response for a
// superseded year is dropped and the previous year's data is never shown.
const useData = (
  year: string | null,
  fetchImpl: typeof fetch = fetch,
): Data => {
  const [result, setResult] = useState<{ year: string; data: Data } | null>(
    null,
  );

  useEffect(() => {
    if (year === null) return;
    let cancelled = false;

    apiFetch<{ player_game_scores?: PlayerGameScore[] }>(
      `/years/${encodeURIComponent(year)}/scores`,
      {},
      fetchImpl,
    )
      .then((body) => {
        if (!Array.isArray(body?.player_game_scores)) {
          throw new Error("unexpected scores body");
        }
        return build(body.player_game_scores);
      })
      .catch(() => failed)
      .then((data) => {
        if (!cancelled) setResult({ year, data });
      });

    return () => {
      cancelled = true;
    };
  }, [year, fetchImpl]);

  return year !== null && result?.year === year ? result.data : pending;
};

export default useData;
