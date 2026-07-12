import { assoc, descend, forEach, keys, pick, prop, sort, values } from "ramda";

// Player-count bounds for a game, with the same 0/99 defaults App used when a
// game has no metadata in games.json.
export const gameBounds = (gameData, id) => {
  const meta = gameData[id];

  if (meta && meta.players) {
    return { min: meta.players.min, max: meta.players.max };
  }

  return { min: 0, max: 99 };
};

// Max score used to normalize the Score cells. individualMax is a single
// player's best possible score; selectedMax scales it by the number of players
// in view (all players when none are filtered).
export const computeMaxScores = (data, players) => {
  const numPlayers = players.length || 0;
  const individualMax = data.max;
  const selectedMax =
    numPlayers === 0
      ? data.max * Object.keys(data.by_player).length
      : data.max * numPlayers;

  return { individualMax, selectedMax };
};

// Aggregate the per-player score rows into a sorted list of games. Kept pure
// (images/gameData/getPlayedCount injected) so it can be tested without Vite or
// a rendered tree.
export const buildSelectedGames = ({
  byPlayer,
  players,
  gameData,
  images,
  hidePlayed,
  getPlayedCount,
}) => {
  const numPlayers = players.length || 0;
  const selectedGames = {};

  forEach(
    (player) => {
      forEach((item) => {
        if (!(item.game in selectedGames)) {
          const id = `${item.bgg_id}`;
          const meta = gameData[id];
          const { min, max } = gameBounds(gameData, id);

          if (hidePlayed && getPlayedCount(id) > 0) {
            return;
          }
          if (numPlayers > 1 && (numPlayers < min || numPlayers > max)) {
            return;
          }

          selectedGames[item.game] = {
            name: item.game,
            score: 0,
            id,
            min,
            max,
          };

          if (meta && meta.image) {
            selectedGames[item.game]["image"] =
              images[`/src/assets/games/${id}${meta.ext}`];
          }
        }
        const game = selectedGames[item.game];
        selectedGames[item.game] = assoc(
          "score",
          game.score + item.score,
          assoc(
            "players",
            assoc(
              player,
              assoc("name", player, pick(["rank", "score"], item)),
              game.players || {},
            ),
            game,
          ),
        );
      }, byPlayer[player] || []);
    },
    (players.length > 0 ? players : keys(byPlayer)) || [],
  );

  return sort(descend(prop("score")), values(selectedGames));
};
