import { avatarUrl, gameLabel } from "@/lib/games";
import type { PlayedMap } from "@/lib/played";
import type {
  GamesData,
  PlayerGameScore,
  UnplayedPick,
  UnplayedPickOwner,
  UnplayedPickTier,
} from "@/types";

// A member's picks count down to this rank.
export const UNPLAYED_PICK_RANKS = 10;

interface Input {
  scores: PlayerGameScore[];
  // Each member's played games, by discord id.
  allPlayed: Record<string, PlayedMap>;
  games: GamesData;
}

const better = (a: PlayerGameScore, b: PlayerGameScore) =>
  a.rank < b.rank || (a.rank === b.rank && a.score > b.score);

const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" });

// Games that sit in a member's top picks (rank 1 to UNPLAYED_PICK_RANKS) and
// that member has not played, grouped into tiers by the best rank an unplayed
// member gives them. A game lists every member with it in their top picks, so
// the page can show who else wants it. Only linked players (with a discord id)
// count; a member with no played data has played nothing.
export const buildTopPicks = ({
  scores,
  allPlayed,
  games,
}: Input): UnplayedPickTier[] => {
  const sorted = scores
    .filter(
      (r) =>
        r.discord_id !== undefined &&
        r.discord_id !== "" &&
        Number.isInteger(r.rank) &&
        r.rank >= 1 &&
        r.rank <= UNPLAYED_PICK_RANKS,
    )
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.score - a.score ||
        byName(a.player, b.player) ||
        a.bgg_id - b.bgg_id,
    );

  // One label per member, the first name seen in sorted order.
  const labels = new Map<string, { name: string; image?: string }>();
  // The member's best row per game.
  const best = new Map<string, Map<string, PlayerGameScore>>();
  for (const row of sorted) {
    const id = row.discord_id as string;
    if (!labels.has(id)) {
      labels.set(id, { name: row.player, image: avatarUrl(row.discord_image) });
    }
    const perGame = best.get(String(row.bgg_id)) ?? new Map();
    const have = perGame.get(id);
    if (!have || better(row, have)) perGame.set(id, row);
    best.set(String(row.bgg_id), perGame);
  }

  const tiers = new Map<number, UnplayedPick[]>();
  for (const [bggId, perGame] of best) {
    const owners: UnplayedPickOwner[] = [...perGame].map(([id, row]) => ({
      name: labels.get(id)!.name,
      discordId: id,
      discordImage: labels.get(id)!.image,
      rank: row.rank,
      score: row.score,
      played: Object.hasOwn(allPlayed[id] ?? {}, bggId),
    }));
    const unplayed = owners.filter((o) => !o.played);
    if (unplayed.length === 0) continue;
    owners.sort((a, b) => a.rank - b.rank || byName(a.name, b.name));
    const tier = Math.min(...unplayed.map((o) => o.rank));
    const name = [...perGame.values()].find((r) => r.game)?.game;
    const pick: UnplayedPick = {
      bggId: Number(bggId),
      game: name ?? gameLabel(games, bggId),
      owners,
    };
    tiers.set(tier, [...(tiers.get(tier) ?? []), pick]);
  }

  return [...tiers]
    .sort(([a], [b]) => a - b)
    .map(([rank, picks]) => ({
      rank,
      games: picks.sort(
        (a, b) =>
          b.owners.filter((o) => !o.played).length -
            a.owners.filter((o) => !o.played).length ||
          byName(a.game, b.game) ||
          a.bggId - b.bggId,
      ),
    }));
};
