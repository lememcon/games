import { descend, keys, prop, sort, values } from "ramda";

import type {
  Bounds,
  Data,
  GameMeta,
  GamePlayersRow,
  GameSplit,
  GamesData,
  PlayerGameScore,
  PlayerOverride,
  SelectedGame,
  SplitGroup,
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

// BGG's range for an overridden game, else null (nothing to show alongside).
export const originalBounds = (meta: GameMeta | undefined): Bounds | null =>
  meta?.overridden && meta.bggPlayers
    ? { min: meta.bggPlayers.min, max: meta.bggPlayers.max }
    : null;

// "4" for a fixed count, "2-6" otherwise.
export const formatBounds = ({ min, max }: Bounds): string =>
  min === max ? `${min}` : `${min}-${max}`;

// Case-insensitive match on the name or BGG id.
export const filterGamePlayers = (
  games: GamePlayersRow[],
  query: string,
): GamePlayersRow[] => {
  const q = query.trim().toLowerCase();
  return q
    ? games.filter(
        (g) => g.name.toLowerCase().includes(q) || String(g.bggId).includes(q),
      )
    : games;
};

const isCount = (v: number | string): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 99;

// Checks an admin's override input (a blank NumberInput gives ""). Mirrors the
// server rules: whole numbers 1..99 with min <= max.
export const validateOverride = (
  min: number | string,
  max: number | string,
): { range: Bounds } | { error: string } => {
  if (min === "" || max === "") return { error: "Enter both counts" };
  if (!isCount(min) || !isCount(max))
    return { error: "Use whole numbers from 1 to 99" };
  if (min > max) return { error: "Min can't exceed max" };
  return { range: { min, max } };
};

// Checks a member's own range for a game: valid like an admin override, and
// inside the range the game currently allows (members can only narrow).
export const validateMemberOverride = (
  min: number | string,
  max: number | string,
  allowed: Bounds,
): { range: Bounds } | { error: string } => {
  const checked = validateOverride(min, max);
  if ("error" in checked) return checked;
  const { range } = checked;
  if (range.min < allowed.min || range.max > allowed.max)
    return {
      error: `Must stay within ${formatBounds(allowed)} (can't widen)`,
    };
  return checked;
};

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

// Play counts by player name, then bgg id; absent means zero.
export type PlayerCounts = Record<string, Record<string, number>>;

// Members' own player count ranges by player name, then bgg id.
export type PlayerRanges = Record<string, Record<string, Bounds>>;

// Groups the flat override list by discord id, then bgg id.
export const rangesByMember = (
  overrides: PlayerOverride[],
): Record<string, Record<string, Bounds>> => {
  const result: Record<string, Record<string, Bounds>> = {};
  for (const { discordId, bggId, min, max } of overrides)
    (result[discordId] ??= {})[bggId] = { min, max };
  return result;
};

// Re-keys per-member values (by discord id) to the score data's player names.
// The name -> discord id link comes from every score row, so it still resolves
// when all of a player's games are hidden. Players without a linked member get
// no entry.
export const playerCountsByName = <T>(
  byPlayer: Record<string, PlayerGameScore[]>,
  values: Record<string, T>,
): Record<string, T> => {
  const result: Record<string, T> = {};
  for (const [player, rows] of Object.entries(byPlayer)) {
    const discordId = rows.find((r) => r.discord_id)?.discord_id;
    if (discordId && values[discordId]) result[player] = values[discordId];
  }
  return result;
};

// Aggregate the per-player score rows into a sorted list of games. Kept pure
// (images/gameData/playerCounts injected) so it can be tested without Vite or
// a rendered tree.
interface BuildSelectedGamesArgs {
  byPlayer: Record<string, PlayerGameScore[]>;
  players: string[];
  gameData: GamesData;
  images: Record<string, string>;
  hidePlayed: boolean;
  playerCounts: PlayerCounts;
  // Defaults to none.
  playerRanges?: PlayerRanges;
}

export const buildSelectedGames = ({
  byPlayer,
  players,
  gameData,
  images,
  hidePlayed,
  playerCounts,
  playerRanges = {},
}: BuildSelectedGamesArgs): SelectedGame[] => {
  const numPlayers = players.length;
  const selectedGames: Record<string, SelectedGame> = {};

  const selectedPlayers = players.length > 0 ? players : keys(byPlayer);

  // Who among the selected players has played a game this year, with counts.
  const playedByFor = (id: string): Record<string, number> => {
    const playedBy: Record<string, number> = {};
    for (const player of selectedPlayers) {
      const count = playerCounts[player]?.[id] ?? 0;
      if (count > 0) playedBy[player] = count;
    }
    return playedBy;
  };

  // Whether a not-yet-seen game should be left out of the list entirely.
  const isExcluded = (
    id: string,
    playedBy: Record<string, number>,
    min: number,
    max: number,
  ): boolean => {
    if (hidePlayed && Object.keys(playedBy).length > 0) return true;
    if (numPlayers > 1 && (numPlayers < min || numPlayers > max)) return true;
    // A member in the group who narrowed this game's range to exclude the
    // group's size, whether or not they scored the game.
    return (
      numPlayers > 1 &&
      players.some((p) => {
        const own = playerRanges[p]?.[id];
        return (
          own !== undefined && (numPlayers < own.min || numPlayers > own.max)
        );
      })
    );
  };

  for (const player of selectedPlayers) {
    for (const item of byPlayer[player] || []) {
      if (!(item.game in selectedGames)) {
        const id = `${item.bgg_id}`;
        const meta = gameData[id];
        const { min, max } = gameBounds(gameData, id);

        const playedBy = playedByFor(id);
        if (isExcluded(id, playedBy, min, max)) continue;

        selectedGames[item.game] = {
          name: item.game,
          score: 0,
          id,
          min,
          max,
          players: {},
          playedBy,
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

export const MIN_SPLIT_PLAYERS = 4;
export const MAX_SPLIT_PLAYERS = 8;
export const MAX_SPLITS = 3;
export const GAMES_PER_GROUP = 4;

// Every way to divide the items into exactly two groups of at least two.
export const partitions = (items: string[]): string[][][] => {
  const result: string[][][] = [];
  const place = (i: number, groups: string[][]) => {
    if (i === items.length) {
      if (groups.length === 2 && groups.every((g) => g.length >= 2)) {
        result.push(groups.map((g) => [...g]));
      }
      return;
    }
    for (const group of groups) {
      group.push(items[i]);
      place(i + 1, groups);
      group.pop();
    }
    groups.push([items[i]]);
    place(i + 1, groups);
    groups.pop();
  };
  place(0, []);
  return result;
};

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// The best reuse-free pick: one game per group maximizing the summed score.
// Only each group's top `groups.length` games can matter, since that many
// alternatives always leave one unused. Ties go to the earlier game names.
const pickGames = (lists: SelectedGame[][]): SelectedGame[] | null => {
  const k = lists.length;
  let best: SelectedGame[] | null = null;
  let bestScore = -Infinity;
  const names = (picks: SelectedGame[]) => picks.map((g) => g.name).join("\n");
  const walk = (i: number, picks: SelectedGame[], score: number) => {
    if (i === k) {
      if (
        score > bestScore ||
        (score === bestScore && best && names(picks) < names(best))
      ) {
        best = [...picks];
        bestScore = score;
      }
      return;
    }
    for (const game of lists[i].slice(0, k)) {
      if (picks.some((p) => p.name === game.name)) continue;
      picks.push(game);
      walk(i + 1, picks, score + game.score);
      picks.pop();
    }
  };
  walk(0, [], 0);
  return best;
};

// Suggest ways to split 4-8 selected players into two groups of two or more. Each
// group lists its top games that every member scored; the headline plan picks
// each group's best game without reusing a game, and splits are ranked by that
// plan's summed score per player, compared with the best all-together game.
export const suggestSplits = (args: BuildSelectedGamesArgs): GameSplit[] => {
  const players = [...args.players].sort(byText);
  if (players.length < MIN_SPLIT_PLAYERS || players.length > MAX_SPLIT_PLAYERS)
    return [];

  const cache = new Map<string, SelectedGame[]>();
  const scoredBy = (group: string[]): SelectedGame[] => {
    const key = group.join("\n");
    let games = cache.get(key);
    if (!games) {
      games = buildSelectedGames({ ...args, players: group }).filter(
        (g) => Object.keys(g.players).length === group.length,
      );
      cache.set(key, games);
    }
    return games;
  };

  const baseline = scoredBy(players)[0];
  const baselineValue = baseline ? baseline.score / players.length : null;

  const splits: { split: GameSplit; tie: string }[] = [];
  for (const parts of partitions(players)) {
    const lists = parts.map(scoredBy);
    const picks = pickGames(lists);
    if (!picks) continue;
    const perPlayer =
      picks.reduce((sum, g) => sum + g.score, 0) / players.length;
    const groups: SplitGroup[] = parts.map((group, i) => ({
      players: group,
      games: lists[i].slice(0, GAMES_PER_GROUP),
      picked: picks[i].name,
    }));
    splits.push({
      split: {
        groups,
        perPlayer,
        delta: baselineValue === null ? null : perPlayer - baselineValue,
      },
      tie:
        picks.map((g) => g.name).join("\n") +
        "\n\n" +
        parts.map((g) => g.join("\n")).join("\n\n"),
    });
  }

  splits.sort(
    (a, b) => b.split.perPlayer - a.split.perPlayer || byText(a.tie, b.tie),
  );
  return splits.slice(0, MAX_SPLITS).map((s) => s.split);
};
