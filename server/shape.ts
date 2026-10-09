/** Pure shaping between database rows and the API/legacy shapes. SQL stays in server/db. */
import type { BggGame } from "./bgg/client";
import type { NormalizedGame, NormalizedImport } from "./import";
import type {
  GameRow,
  GamesMap,
  ImportSummary,
  LegacyScoreRow,
  ProfileScore,
  ProfileStats,
  ScoreRow,
  YearTopGames,
} from "./types";

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    chunks.push(items.slice(i, i + size));
  return chunks;
}

/** A stored score as the row shape the app has always consumed. */
export const toLegacyRow = (r: ScoreRow): LegacyScoreRow => ({
  bgg_id: r.bggId,
  game: r.gameName ?? "",
  player: r.playerName,
  score: r.score,
  rank: r.rank,
  ...(r.discordId ? { discord_id: r.discordId } : {}),
});

export interface NameParts {
  /** Chosen name of the linked approved member. */
  displayName: string | null;
  /** Discord name of the linked approved member's login. */
  discordName: string | null;
  /** Name in the data file. */
  dataName: string;
}

/**
 * Builds the resolver for shown player names: the display name if set, else
 * the Discord name unless it clashes (any case) with another player's
 * data-file name or another approved member's shown name, else the data-file
 * name. A Discord name equal to the player's own data-file name is no clash.
 */
export function createNameResolver(
  playerNames: readonly string[],
  members: readonly {
    discordId: string;
    displayName: string | null;
    discordName: string | null;
  }[],
) {
  const lower = (n: string) => n.toLowerCase();
  const data = new Set(playerNames.map(lower));
  const shown = new Map<string, Set<string>>();
  for (const m of members) {
    const name = m.displayName ?? m.discordName;
    if (name === null) continue;
    const key = lower(name);
    shown.set(key, (shown.get(key) ?? new Set()).add(m.discordId));
  }
  return (r: NameParts & { discordId?: string | null }): string => {
    if (r.displayName) return r.displayName;
    if (!r.discordName) return r.dataName;
    const key = lower(r.discordName);
    const clashesData = data.has(key) && key !== lower(r.dataName);
    const clashesMember = [...(shown.get(key) ?? [])].some(
      (id) => id !== r.discordId,
    );
    return clashesData || clashesMember ? r.dataName : r.discordName;
  };
}

const MOST_PLAYED = 5;
const PODIUM = 3;
const TOP_PER_YEAR = 10;

/** Each year's best finishes: rank, then score (high first), game name, bgg id. */
function topByYear(scores: readonly ProfileScore[]): YearTopGames[] {
  const byYear = new Map<number, ProfileScore[]>();
  for (const s of scores)
    byYear.set(s.year, [...(byYear.get(s.year) ?? []), s]);
  return [...byYear]
    .sort(([a], [b]) => b - a)
    .map(([year, rows]) => ({
      year,
      total: rows.length,
      games: rows
        .sort(
          (a, b) =>
            a.rank - b.rank ||
            b.score - a.score ||
            a.game.localeCompare(b.game) ||
            a.bggId - b.bggId,
        )
        .slice(0, TOP_PER_YEAR)
        .map(({ bggId, game, rank, score }) => ({ bggId, game, rank, score })),
    }));
}

/** Stats over all of a player's scores; null input means no player is linked. */
export function toProfileStats(
  scores: readonly ProfileScore[] | null,
): ProfileStats | null {
  if (scores === null) return null;
  const games = scores.length;
  const wins = scores.filter((s) => s.rank === 1).length;
  const byGame = new Map<number, ProfileScore[]>();
  for (const s of scores)
    byGame.set(s.bggId, [...(byGame.get(s.bggId) ?? []), s]);
  const mostPlayed = [...byGame.values()]
    .map((plays) => {
      const bestRank = Math.min(...plays.map((p) => p.rank));
      return {
        bggId: plays[0].bggId,
        game: plays[0].game,
        plays: plays.length,
        bestRank,
        bestScore: Math.max(
          ...plays.filter((p) => p.rank === bestRank).map((p) => p.score),
        ),
      };
    })
    .sort(
      (a, b) =>
        b.plays - a.plays ||
        a.bestRank - b.bestRank ||
        a.game.localeCompare(b.game) ||
        a.bggId - b.bggId,
    )
    .slice(0, MOST_PLAYED);
  return {
    games,
    wins,
    winRate: games ? wins / games : 0,
    avgRank: games ? scores.reduce((sum, s) => sum + s.rank, 0) / games : 0,
    podiums: scores.filter((s) => s.rank <= PODIUM).length,
    mostPlayed,
    topByYear: topByYear(scores),
  };
}

/** The games.json shape. Null columns are omitted so gameBounds sees undefined. */
export function toGamesMap(rows: readonly GameRow[]): GamesMap {
  const map: GamesMap = {};
  for (const r of rows) {
    map[String(r.bggId)] = {
      ...(r.minPlayers !== null && r.maxPlayers !== null
        ? { players: { min: r.minPlayers, max: r.maxPlayers } }
        : {}),
      ...(r.imageUrl !== null ? { image: r.imageUrl } : {}),
      ...(r.imageExt !== null ? { ext: r.imageExt } : {}),
    };
  }
  return map;
}

/** Games carrying metadata, as game_metadata rows; name-only games get none. */
export const toMetadata = (games: readonly NormalizedGame[]): BggGame[] =>
  games
    .filter(
      (g) =>
        g.minPlayers !== null ||
        g.maxPlayers !== null ||
        g.imageUrl !== null ||
        g.imageExt !== null,
    )
    .map((g) => ({
      bggId: g.bggId,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers,
      imageUrl: g.imageUrl,
      ext: g.imageExt,
    }));

export interface GamePlan {
  created: number;
  updated: number;
  warnings: string[];
}

/**
 * Compares incoming games with the stored ones (before the upsert). A stored
 * name is never overwritten, so a different incoming name is a rename warning;
 * a null stored name is backfilled, not a rename.
 */
export function planGames(
  existing: readonly { bggId: number; name: string | null }[],
  incoming: readonly NormalizedGame[],
): GamePlan {
  const stored = new Map(existing.map((g) => [g.bggId, g.name]));
  const plan: GamePlan = { created: 0, updated: 0, warnings: [] };
  for (const game of incoming) {
    if (!stored.has(game.bggId)) {
      plan.created++;
      continue;
    }
    plan.updated++;
    const name = stored.get(game.bggId);
    if (
      name !== null &&
      name !== undefined &&
      game.name !== null &&
      game.name !== name
    )
      plan.warnings.push(
        `bgg_id ${game.bggId} renamed ${JSON.stringify(name)} to ${JSON.stringify(game.name)} in the file; kept ${JSON.stringify(name)}`,
      );
  }
  return plan;
}

/** Players from the upload with no stored player of the same name (any case). */
export function newPlayers(
  stored: readonly string[],
  players: readonly string[],
): string[] {
  const known = new Set(stored.map((n) => n.toLowerCase()));
  return players.filter((p) => !known.has(p.toLowerCase()));
}

export function summarize(
  input: NormalizedImport,
  plan: GamePlan,
  newPlayerCount: number,
): ImportSummary {
  return {
    year: input.year,
    scores: input.scores.length,
    games: { new: plan.created, updated: plan.updated },
    players: { new: newPlayerCount, total: input.players.length },
    warnings: [...input.warnings, ...plan.warnings],
  };
}
