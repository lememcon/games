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
 * Builds the resolver for shown player names, once per member so all of a
 * member's names show the same: the display name if set, else the Discord name
 * unless it clashes (any case) with the data-file name of an unlinked player
 * or another member's player, or with another approved member's shown name,
 * else the member's data-file name with the lowest player id. A member's own
 * data-file names never clash. A player linked to a non-approved member counts
 * as unlinked.
 */
export function createNameResolver(
  players: readonly { id: number; name: string; discordId: string | null }[],
  members: readonly {
    discordId: string;
    displayName: string | null;
    discordName: string | null;
  }[],
) {
  const lower = (n: string) => n.toLowerCase();
  const approved = new Set(members.map((m) => m.discordId));
  const owner = (p: { discordId: string | null }) =>
    p.discordId !== null && approved.has(p.discordId) ? p.discordId : null;
  // Lowercase data name -> owners of the players with that name.
  const data = new Map<string, Set<string | null>>();
  // Member -> their lowest-id player.
  const first = new Map<string, { id: number; name: string }>();
  for (const p of players) {
    const key = lower(p.name);
    data.set(key, (data.get(key) ?? new Set()).add(owner(p)));
    const o = owner(p);
    const known = o === null ? undefined : first.get(o);
    if (o !== null && (!known || p.id < known.id))
      first.set(o, { id: p.id, name: p.name });
  }
  const shown = new Map<string, Set<string>>();
  for (const m of members) {
    const name = m.displayName ?? m.discordName;
    if (name === null) continue;
    const key = lower(name);
    shown.set(key, (shown.get(key) ?? new Set()).add(m.discordId));
  }
  return (r: NameParts & { discordId?: string | null }): string => {
    if (r.displayName) return r.displayName;
    const id = r.discordId ?? null;
    const fallback = (id !== null && first.get(id)?.name) || r.dataName;
    if (!r.discordName) return fallback;
    const key = lower(r.discordName);
    const clashesData = [...(data.get(key) ?? [])].some((o) => o !== id);
    const clashesMember = [...(shown.get(key) ?? [])].some((m) => m !== id);
    if (!clashesData && !clashesMember) return r.discordName;
    return fallback;
  };
}

export interface MemberScore {
  /** Score id; breaks ties and orders the output. */
  id: number;
  /** Approved member who owns the row, else null. */
  owner: string | null;
  bggId: number;
  year: number;
  score: number;
  rank: number;
}

/**
 * One row per member, game and year: when several of a member's names scored
 * in the same game and year, keeps the best rank, then the highest score, then
 * the lowest id. Rows without an owner pass through. Output is in id order.
 */
export function collapseMemberScores<T extends MemberScore>(
  rows: readonly T[],
): T[] {
  const best = new Map<string, T>();
  const out: T[] = [];
  for (const r of rows) {
    if (r.owner === null) {
      out.push(r);
      continue;
    }
    const key = `${r.owner}|${r.bggId}|${r.year}`;
    const cur = best.get(key);
    if (
      !cur ||
      r.rank < cur.rank ||
      (r.rank === cur.rank &&
        (r.score > cur.score || (r.score === cur.score && r.id < cur.id)))
    )
      best.set(key, r);
  }
  return [...out, ...best.values()].sort((a, b) => a.id - b.id);
}

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
  const top = topByYear(scores);
  return { years: top.length, topByYear: top };
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
