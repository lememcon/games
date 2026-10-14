import { gameLabel } from "@/lib/games";
import type { PlayedMap } from "@/lib/played";
import type {
  GamesData,
  PlayerGameScore,
  Recap,
  RecapFacts,
  RecapGame,
  SelectedGame,
  TopGame,
} from "@/types";

// How many of the year's best group games the recap checks for plays.
export const RECAP_TOP = 10;

const TOP_PICKS_SHOWN = 3;
const ONLY_YOU_SHOWN = 5;

export interface BuildRecapArgs {
  // The first RECAP_TOP of buildSelectedGames for the year, best first.
  top: SelectedGame[];
  // The member's played games that year, by bgg id.
  played: PlayedMap;
  // The member's played games for each earlier year, by year.
  earlierPlayed: Record<string, PlayedMap>;
  // The year's score rows (member rows by discord_id, game names by bgg_id).
  scores: PlayerGameScore[];
  discordId: string;
  // Every member's played games that year: discord id, then bgg id.
  allPlayed: Record<string, PlayedMap>;
  // The game catalog; names new picks that have no score row.
  games: GamesData;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const hasData = (played: PlayedMap): boolean => Object.keys(played).length > 0;

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

export const buildRecap = ({
  top,
  played,
  earlierPlayed,
  scores,
  discordId,
  allPlayed,
  games,
}: BuildRecapArgs): Recap => {
  const ids = Object.keys(played);

  const unplayedTop = top
    .map((g, i) => ({ bggId: Number(g.id), game: g.name, rank: i + 1 }))
    .filter((g) => !(g.bggId in played));

  // Years with data, nearest first.
  const earlier = Object.keys(earlierPlayed)
    .filter((year) => hasData(earlierPlayed[year]))
    .sort((a, b) => Number(b) - Number(a));

  // A game name per bgg id; the empty string counts as unnamed.
  const names = new Map<string, string>();
  for (const row of scores) {
    if (row.game !== "") names.set(`${row.bgg_id}`, row.game);
  }
  const named = (id: string): RecapGame | null => {
    const game = names.get(id);
    return game === undefined ? null : { bggId: Number(id), game };
  };

  const newPicks =
    earlier.length === 0
      ? null
      : ids
          .filter((id) => earlier.every((y) => !(id in earlierPlayed[y])))
          .map(
            (id) =>
              named(id) ?? { bggId: Number(id), game: gameLabel(games, id) },
          )
          .sort((a, b) => byText(a.game, b.game));

  return {
    playedGames: ids.length,
    unplayedTop,
    newPicks,
    facts: buildFacts({
      ids,
      earlier,
      earlierPlayed,
      scores,
      discordId,
      allPlayed,
      named,
    }),
  };
};

interface FactsArgs {
  ids: string[];
  earlier: string[];
  earlierPlayed: Record<string, PlayedMap>;
  scores: PlayerGameScore[];
  discordId: string;
  allPlayed: Record<string, PlayedMap>;
  named: (id: string) => RecapGame | null;
}

const toTop = (row: PlayerGameScore): TopGame => ({
  bggId: row.bgg_id,
  game: row.game,
  rank: row.rank,
  score: row.score,
});

const buildFacts = ({
  ids,
  earlier,
  earlierPlayed,
  scores,
  discordId,
  allPlayed,
  named,
}: FactsArgs): RecapFacts => {
  const memberTotals = Object.values(allPlayed)
    .map((c) => Object.keys(c).length)
    .filter((total) => total > 0);
  const groupAvgGames =
    memberTotals.length === 0 ? null : sum(memberTotals) / memberTotals.length;

  // The member's own rows (the server already keeps one per game).
  const mine = scores.filter(
    (row) => row.discord_id === discordId && row.game !== "",
  );
  const firsts = mine
    .filter((row) => row.rank === 1)
    .sort((a, b) => b.score - a.score || byText(a.game, b.game));
  const highestRating =
    [...mine].sort(
      (a, b) => b.score - a.score || a.rank - b.rank || byText(a.game, b.game),
    )[0] ?? null;

  const groupTotals = new Map<string, number>();
  for (const c of Object.values(allPlayed)) {
    for (const id of Object.keys(c)) {
      groupTotals.set(id, (groupTotals.get(id) ?? 0) + 1);
    }
  }
  const groupFavourite =
    [...groupTotals]
      .flatMap(([id, members]) => {
        const game = named(id);
        return game ? [{ ...game, members }] : [];
      })
      .sort((a, b) => b.members - a.members || byText(a.game, b.game))[0] ??
    null;

  const others = Object.entries(allPlayed).filter(([id]) => id !== discordId);
  const only = ids
    .filter((id) => others.every(([, c]) => !(id in c)))
    .map(named)
    .filter((g): g is RecapGame => g !== null)
    .sort((a, b) => byText(a.game, b.game));

  const previous = earlier[0];
  return {
    groupAvgGames,
    topPicks: {
      total: firsts.length,
      games: firsts.slice(0, TOP_PICKS_SHOWN).map(toTop),
    },
    highestRating: highestRating ? toTop(highestRating) : null,
    groupFavourite,
    onlyYou: { total: only.length, games: only.slice(0, ONLY_YOU_SHOWN) },
    versusPrevious:
      previous === undefined
        ? null
        : {
            year: Number(previous),
            gamesPlayed: ids.length,
            delta: ids.length - Object.keys(earlierPlayed[previous]).length,
          },
  };
};
