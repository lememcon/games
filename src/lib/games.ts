import { descend, keys, prop, sort, values } from "ramda";

import type {
  Bounds,
  Data,
  GameMeta,
  GamesData,
  PlayerGameScore,
  SelectedGame,
} from "@/types";

// The real player-count bounds for a game, or null when the metadata is
// missing or incomplete (the API sends null min/max for games without them).
export const realBounds = (meta: GameMeta | undefined): Bounds | null => {
  const players = meta?.players;
  if (players && players.min !== null && players.max !== null) {
    return { min: players.min, max: players.max };
  }
  return null;
};

// Player-count bounds for a game, defaulting to 0/99 when they are unknown.
export const gameBounds = (gameData: GamesData, id: string): Bounds =>
  realBounds(gameData[id]) ?? { min: 0, max: 99 };

const isHttpsUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

// An avatar URL when it is a valid https URL, else none.
export const avatarUrl = (value: string | null | undefined) =>
  isHttpsUrl(value) ? value : undefined;

// Cover image for a game: the bundled file for this id and ext, then the
// game's image URL when it is a valid https URL, else none.
export const resolveImage = (
  id: string,
  meta: GameMeta | undefined,
  images: Record<string, string>,
): string | undefined => {
  if (!meta) return undefined;
  const bundled = meta.ext ? images[`/src/assets/games/${id}${meta.ext}`] : "";
  if (bundled) return bundled;
  return isHttpsUrl(meta.image) ? meta.image : undefined;
};

// Max score used to normalize the Score cells. individualMax is a single
// player's best possible score; selectedMax scales it by the number of players
// in view (all players when none are filtered).
export const computeMaxScores = (
  data: Data,
  players: string[],
): { individualMax: number; selectedMax: number } => {
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
interface BuildSelectedGamesArgs {
  byPlayer: Record<string, PlayerGameScore[]>;
  players: string[];
  gameData: GamesData;
  images: Record<string, string>;
  hidePlayed: boolean;
  getPlayedCount: (id: string) => number;
}

export const buildSelectedGames = ({
  byPlayer,
  players,
  gameData,
  images,
  hidePlayed,
  getPlayedCount,
}: BuildSelectedGamesArgs): SelectedGame[] => {
  const numPlayers = players.length;
  const selectedGames: Record<string, SelectedGame> = {};

  // Whether a not-yet-seen game should be left out of the list entirely.
  const isExcluded = (id: string, min: number, max: number): boolean => {
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
        const image = resolveImage(id, meta, images);
        if (image) selectedGames[item.game].image = image;
      }

      const game = selectedGames[item.game];
      game.score += item.score;
      game.players[player] = {
        name: player,
        rank: item.rank,
        score: item.score,
        ...(item.discord_id ? { discordId: item.discord_id } : {}),
        ...(avatarUrl(item.discord_image)
          ? { discordImage: avatarUrl(item.discord_image) }
          : {}),
      };
    }
  }

  return sort(descend(prop("score")), values(selectedGames));
};
