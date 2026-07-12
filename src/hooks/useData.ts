import { useEffect, useState } from "react";

import { append, assoc, dissoc, reduce } from "ramda";

import type { Data, PlayerGameScore } from "@/types";

// The reduce accumulators group score rows by a key; each grouping drops one
// key from the row at runtime (dissoc). @types/ramda cannot express that
// point-free chain precisely, so the accumulator returns are cast back to the
// group type. Consumers still see the precise Data type from this hook.
type Group = Record<string, PlayerGameScore[]>;

const useData = (year: string): Data => {
  const [data, setData] = useState<Data>({
    loading: true,
    scores: [],
    by_game: {},
    by_player: {},
    by_id: {},
    max: 0,
  });

  const url = `https://data.lememcon.com/${year}.json`;
  let max = 0;

  useEffect(() => {
    fetch(url)
      .then((res) => res.json())
      .then((data: { player_game_scores: PlayerGameScore[] }) => {
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
          data.player_game_scores,
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
          data.player_game_scores,
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

            return assoc(
              score.player,
              [dissoc("player", score)],
              players,
            ) as Group;
          },
          {},
          data.player_game_scores,
        );

        setData({
          loading: false,
          scores: data.player_game_scores,
          by_game,
          by_player,
          by_id,
          max,
        });
      });
  }, [url]);

  return data;
};

export default useData;
