import { useEffect, useState } from "react";

import { append, assoc, dissoc, reduce } from "ramda";

const useData = (year) => {
  const [data, setData] = useState({
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
      .then((data) => {
        const by_id = reduce(
          (games, score) => {
            const id = `${score.bgg_id}`;
            if (id in games) {
              return assoc(
                id,
                append(dissoc("bgg_id", score), games[id]),
                games,
              );
            }

            max = Math.max(max, score.score);
            return assoc(id, [dissoc("bgg_id", score)], games);
          },
          {},
          data.player_game_scores,
        );
        const by_game = reduce(
          (games, score) => {
            if (score.game in games) {
              return assoc(
                score.game,
                append(dissoc("game", score), games[score.game]),
                games,
              );
            }

            return assoc(score.game, [dissoc("game", score)], games);
          },
          {},
          data.player_game_scores,
        );
        const by_player = reduce(
          (players, score) => {
            if (score.player in players) {
              return assoc(
                score.player,
                append(dissoc("player", score), players[score.player]),
                players,
              );
            }

            return assoc(score.player, [dissoc("player", score)], players);
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
