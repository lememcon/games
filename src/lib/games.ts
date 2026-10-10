import { ascend, descend, keys, prop, sort, values } from "ramda";

import type {
  Bounds,
  Data,
  GameMeta,
  GameSplit,
  GamesData,
  PlayerGameScore,
  PlayerOverride,
  SelectedGame,
  SortMode,
  SplitGroup,
  Veto,
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

// "4" for a fixed count, "2-6" otherwise.
export const formatBounds = ({ min, max }: Bounds): string =>
  min === max ? `${min}` : `${min}-${max}`;

const isCount = (v: number | string): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 99;

// Checks a player count range input (a blank NumberInput gives ""). Mirrors the
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

// Checks a member's own range for a game: valid like a range input, and
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

// Games each player vetoed by player name, as bgg id strings.
export type PlayerVetoes = Record<string, ReadonlySet<string>>;

// Groups the flat veto list by discord id, then bgg id.
export const vetoesByMember = (
  vetoes: Veto[],
): Record<string, ReadonlySet<string>> => {
  const result: Record<string, Set<string>> = {};
  for (const { discordId, bggId } of vetoes)
    (result[discordId] ??= new Set()).add(`${bggId}`);
  return result;
};

// Re-keys per-member values (by discord id) to the score data's player names.
// The name -> discord id link comes from every score row, so it still resolves
// when all of a player's games are hidden. Players without a linked member get
// no entry.
export const playerCountsByName = <T>(
  byPlayer: Record<string, PlayerGameScore[]>,
  byDiscordId: Record<string, T>,
): Record<string, T> => {
  const result: Record<string, T> = {};
  for (const [player, rows] of Object.entries(byPlayer)) {
    const discordId = rows.find((r) => r.discord_id)?.discord_id;
    if (discordId && byDiscordId[discordId])
      result[player] = byDiscordId[discordId];
  }
  return result;
};

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: "total", label: "Total" },
  { value: "lowest", label: "Lowest rank" },
  { value: "even", label: "Most even" },
];

// Any stored or shared value to a sort mode; unknown values mean "total".
export const parseSortMode = (v: unknown): SortMode =>
  SORT_MODES.find((m) => m.value === v)?.value ?? "total";

const scorers = (game: SelectedGame) => Object.values(game.players);

// The worst (highest-numbered) rank among the players who scored the game.
export const worstRank = (game: SelectedGame): number =>
  scorers(game).reduce((worst, p) => (p.rank > worst ? p.rank : worst), 0);

// The gap between the best and worst scorer, 0 for a single scorer.
export const scoreSpread = (game: SelectedGame): number => {
  const all = scorers(game).map((p) => p.score);
  return all.length === 0 ? 0 : Math.max(...all) - Math.min(...all);
};

// The mode's key for one game, lower being better; 0 for "total".
const modeKey = (mode: SortMode, game: SelectedGame): number =>
  mode === "lowest" ? worstRank(game) : mode === "even" ? scoreSpread(game) : 0;

// The mode's key across several games: the worst one.
export const pickKey = (mode: SortMode, games: SelectedGame[]): number =>
  games.reduce((worst, g) => Math.max(worst, modeKey(mode, g)), 0);

// Orders games for a mode. "total" is by total score only (the sort is stable,
// so the input order breaks ties). The others put games scored by more of the
// players first, then the mode's key, then total score, then name.
export const compareGames = (
  mode: SortMode,
): ((a: SelectedGame, b: SelectedGame) => number) => {
  if (mode === "total") return descend(prop("score"));
  const steps = [
    descend((g: SelectedGame) => scorers(g).length),
    ascend((g: SelectedGame) => modeKey(mode, g)),
    descend((g: SelectedGame) => g.score),
    ascend((g: SelectedGame) => g.name),
  ];
  return (a, b) => {
    for (const step of steps) {
      const result = step(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
};

export const sortGames = (
  games: SelectedGame[],
  mode: SortMode,
): SelectedGame[] => sort(compareGames(mode), games);

// The scorer with the worst rank (first name alphabetically on a tie), or null
// when fewer than two players scored the game.
export const leastHappyPlayer = (game: SelectedGame): string | null => {
  const all = scorers(game);
  if (all.length < 2) return null;
  return [...all].sort((a, b) => b.rank - a.rank || byText(a.name, b.name))[0]
    .name;
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
  // Defaults to none.
  playerVetoes?: PlayerVetoes;
  // Defaults to "total".
  sortMode?: SortMode;
}

export const buildSelectedGames = ({
  byPlayer,
  players,
  gameData,
  images,
  hidePlayed,
  playerCounts,
  playerRanges = {},
  playerVetoes = {},
  sortMode = "total",
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
    // A member in the group who vetoed this game drops it, even for a group of
    // one. This checks the raw selection, not `selectedPlayers`: with nobody
    // selected that falls back to everyone, and one veto must not hide the game
    // from the unfiltered list.
    if (players.some((p) => playerVetoes[p]?.has(id))) return true;
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
      // A repeated (player, game) row counts once, keeping the best score.
      const existing = game.players[player];
      if (existing && existing.score >= item.score) continue;
      game.score += item.score - (existing?.score ?? 0);
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

  return sortGames(values(selectedGames), sortMode);
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

// The best reuse-free pick: one game per group. In "total" it maximizes the
// summed score, and only each group's top `groups.length` games can matter,
// since that many alternatives always leave one unused. In the other modes it
// first minimizes the mode's key across the picks (searching whole lists), then
// maximizes the summed score. Ties go to the earlier game names.
const pickGames = (
  lists: SelectedGame[][],
  mode: SortMode,
): SelectedGame[] | null => {
  const k = lists.length;
  let best: { picks: SelectedGame[]; key: number; score: number } | null = null;
  const names = (picks: SelectedGame[]) => picks.map((g) => g.name).join("\n");
  const walk = (
    i: number,
    picks: SelectedGame[],
    score: number,
    partialKey: number,
  ) => {
    if (i === k) {
      const key = partialKey;
      if (
        best === null ||
        key < best.key ||
        (key === best.key &&
          (score > best.score ||
            (score === best.score && names(picks) < names(best.picks))))
      ) {
        best = { picks: [...picks], key, score };
      }
      return;
    }
    const candidates = mode === "total" ? lists[i].slice(0, k) : lists[i];
    for (const game of candidates) {
      if (picks.some((p) => p.name === game.name)) continue;
      // The key only grows as picks are added, so a branch already worse than
      // the best key can never win (equal keys still compete on score).
      const nextKey = Math.max(partialKey, modeKey(mode, game));
      if (best !== null && nextKey > (best as { key: number }).key) continue;
      picks.push(game);
      walk(i + 1, picks, score + game.score, nextKey);
      picks.pop();
    }
  };
  walk(0, [], 0, 0);
  return (best as { picks: SelectedGame[] } | null)?.picks ?? null;
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

  const mode = args.sortMode ?? "total";

  // The best total-score game, whatever order the list is in (first on ties).
  const baseline = scoredBy(players).reduce<SelectedGame | undefined>(
    (top, g) => (top === undefined || g.score > top.score ? g : top),
    undefined,
  );
  const baselineValue = baseline ? baseline.score / players.length : null;

  const splits: { split: GameSplit; key: number; tie: string }[] = [];
  for (const parts of partitions(players)) {
    const lists = parts.map(scoredBy);
    const picks = pickGames(lists, mode);
    if (!picks) continue;
    const perPlayer =
      picks.reduce((sum, g) => sum + g.score, 0) / players.length;
    const groups: SplitGroup[] = parts.map((group, i) => {
      const shown = lists[i].slice(0, GAMES_PER_GROUP);
      // The pick can sit past the shown games in the non-total modes; keep it
      // visible by replacing the last one.
      if (!shown.some((g) => g.name === picks[i].name)) {
        shown[shown.length - 1] = picks[i];
      }
      return { players: group, games: shown, picked: picks[i].name };
    });
    splits.push({
      split: {
        groups,
        perPlayer,
        delta: baselineValue === null ? null : perPlayer - baselineValue,
      },
      key: pickKey(mode, picks),
      tie:
        picks.map((g) => g.name).join("\n") +
        "\n\n" +
        parts.map((g) => g.join("\n")).join("\n\n"),
    });
  }

  splits.sort(
    (a, b) =>
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) ||
      b.split.perPlayer - a.split.perPlayer ||
      byText(a.tie, b.tie),
  );
  return splits.slice(0, MAX_SPLITS).map((s) => s.split);
};
