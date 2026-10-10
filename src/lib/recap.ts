import type {
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

type Counts = Record<string, number>;

export interface BuildRecapArgs {
  // The first RECAP_TOP of buildSelectedGames for the year, best first.
  top: SelectedGame[];
  // The member's counts that year, by bgg id.
  counts: Counts;
  // The member's counts for each earlier year, by year.
  earlierCounts: Record<string, Counts>;
  // The year's score rows (member rows by discord_id, game names by bgg_id).
  scores: PlayerGameScore[];
  discordId: string;
  // Every member's counts that year: discord id, then bgg id.
  allCounts: Record<string, Counts>;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const playedIds = (counts: Counts): string[] =>
  Object.keys(counts).filter((id) => counts[id] > 0);

const hasData = (counts: Counts): boolean => Object.keys(counts).length > 0;

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

export const buildRecap = ({
  top,
  counts,
  earlierCounts,
  scores,
  discordId,
  allCounts,
}: BuildRecapArgs): Recap => {
  const played = playedIds(counts);

  const unplayedTop = top
    .map((g, i) => ({ bggId: Number(g.id), game: g.name, rank: i + 1 }))
    .filter((g) => !((counts[g.bggId] ?? 0) > 0));

  // Years with data, nearest first.
  const earlier = Object.keys(earlierCounts)
    .filter((year) => hasData(earlierCounts[year]))
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
      : played
          .filter((id) => earlier.every((y) => !(earlierCounts[y][id] > 0)))
          .map(named)
          .filter((g): g is RecapGame => g !== null)
          .sort((a, b) => byText(a.game, b.game));

  return {
    playedGames: played.length,
    unplayedTop,
    newPicks,
    facts: buildFacts({
      counts,
      played,
      earlier,
      earlierCounts,
      scores,
      discordId,
      allCounts,
      named,
    }),
  };
};

interface FactsArgs {
  counts: Counts;
  played: string[];
  earlier: string[];
  earlierCounts: Record<string, Counts>;
  scores: PlayerGameScore[];
  discordId: string;
  allCounts: Record<string, Counts>;
  named: (id: string) => RecapGame | null;
}

const toTop = (row: PlayerGameScore): TopGame => ({
  bggId: row.bgg_id,
  game: row.game,
  rank: row.rank,
  score: row.score,
});

const buildFacts = ({
  counts,
  played,
  earlier,
  earlierCounts,
  scores,
  discordId,
  allCounts,
  named,
}: FactsArgs): RecapFacts => {
  const totalPlays = sum(played.map((id) => counts[id]));

  const memberTotals = Object.values(allCounts)
    .map((c) => sum(playedIds(c).map((id) => c[id])))
    .filter((total) => total > 0);
  const groupAvgPlays =
    memberTotals.length === 0 ? null : sum(memberTotals) / memberTotals.length;

  const mostPlayed =
    played
      .flatMap((id) => {
        const game = named(id);
        return game ? [{ ...game, plays: counts[id] }] : [];
      })
      .sort((a, b) => b.plays - a.plays || byText(a.game, b.game))[0] ?? null;

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
  for (const c of Object.values(allCounts)) {
    for (const id of playedIds(c)) {
      groupTotals.set(id, (groupTotals.get(id) ?? 0) + c[id]);
    }
  }
  const groupFavourite =
    [...groupTotals]
      .flatMap(([id, plays]) => {
        const game = named(id);
        return game ? [{ ...game, plays, memberPlays: counts[id] ?? 0 }] : [];
      })
      .sort((a, b) => b.plays - a.plays || byText(a.game, b.game))[0] ?? null;

  const others = Object.entries(allCounts).filter(([id]) => id !== discordId);
  const only = played
    .filter((id) => others.every(([, c]) => !(c[id] > 0)))
    .map(named)
    .filter((g): g is RecapGame => g !== null)
    .sort((a, b) => byText(a.game, b.game));

  const previous = earlier[0];
  return {
    totalPlays,
    groupAvgPlays,
    mostPlayed,
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
            gamesPlayed: played.length,
            delta: played.length - playedIds(earlierCounts[previous]).length,
          },
  };
};
