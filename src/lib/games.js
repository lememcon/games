import { descend, keys, prop, sort, values } from "ramda";

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
  const numPlayers = players.length;
  const selectedGames = {};

  // Whether a not-yet-seen game should be left out of the list entirely.
  const isExcluded = (id, min, max) => {
    if (hidePlayed && getPlayedCount(id) > 0) return true;
    if (numPlayers > 1 && (numPlayers < min || numPlayers > max)) return true;
    return false;
  };

  const selectedPlayers = players.length > 0 ? players : keys(byPlayer);

  for (const player of selectedPlayers) {
    for (const item of byPlayer[player] || []) {
      if (!(item.game in selectedGames)) {
        const id = `${item.bgg_id}`;
        const meta = gameData[id];
        const { min, max } = gameBounds(gameData, id);

        if (isExcluded(id, min, max)) continue;

        selectedGames[item.game] = {
          name: item.game,
          score: 0,
          id,
          min,
          max,
          players: {},
        };
        if (meta && meta.image) {
          selectedGames[item.game].image =
            images[`/src/assets/games/${id}${meta.ext}`];
        }
      }

      const game = selectedGames[item.game];
      game.score += item.score;
      game.players[player] = {
        name: player,
        rank: item.rank,
        score: item.score,
      };
    }
  }

  return sort(descend(prop("score")), values(selectedGames));
};
