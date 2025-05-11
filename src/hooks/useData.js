import { useEffect, useState } from "react";

import { append, assoc, dissoc, reduce } from "ramda";

const DATA_JSON = "https://data.lememcon.com/data.json";

const useData = () => {
  const [data, setData] = useState({
    loading: true,
    scores: [],
    by_game: {},
    by_player: {},
  });

  useEffect(() => {
    fetch(DATA_JSON)
      .then((res) => res.json())
      .then((data) => {
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
        });
      });
  }, []);

  return data;
};

export default useData;
