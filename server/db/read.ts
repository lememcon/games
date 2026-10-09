import { and, asc, desc, eq, sql } from "drizzle-orm";

import { toGamesMap, toLegacyRow } from "../shape";
import type { GamesMap, LegacyScoreRow } from "../types";
import { appUser, game, gameMetadata, player, score, year } from "./schema";
import type { StoreDb } from "./userStore";

/** Newest first. */
export async function listYears(db: StoreDb): Promise<number[]> {
  const rows = await db
    .select({ year: year.year })
    .from(year)
    .orderBy(desc(year.year));
  return rows.map((r) => r.year);
}

/**
 * Null when the year is unknown. Rows come back in insertion order. With
 * `resolveNames`, players linked to an approved member show that member's
 * display name (when set) and carry their `discord_id`.
 */
export async function getScores(
  db: StoreDb,
  value: number,
  resolveNames = false,
): Promise<LegacyScoreRow[] | null> {
  const [found] = await db.select().from(year).where(eq(year.year, value));
  if (!found) return null;
  const rows = await db
    .select({
      bggId: score.bggId,
      gameName: game.name,
      playerName: resolveNames
        ? sql<string>`coalesce(${appUser.displayName}, ${player.name})`
        : player.name,
      discordId: resolveNames ? appUser.discordId : sql<null>`null`,
      score: score.score,
      rank: score.rank,
    })
    .from(score)
    .innerJoin(game, eq(game.bggId, score.bggId))
    .innerJoin(player, eq(player.id, score.playerId))
    .leftJoin(
      appUser,
      and(
        resolveNames ? eq(appUser.discordId, player.discordId) : sql`false`,
        eq(appUser.status, "approved"),
      ),
    )
    .where(eq(score.year, value))
    .orderBy(asc(score.id));
  return rows.map(toLegacyRow);
}

/** Every game with metadata or a name, including those with no scores. */
export async function getGames(db: StoreDb): Promise<GamesMap> {
  const bggId = sql<number>`coalesce(${gameMetadata.bggId}, ${game.bggId})`;
  const rows = await db
    .select({
      bggId,
      name: game.name,
      minPlayers: gameMetadata.minPlayers,
      maxPlayers: gameMetadata.maxPlayers,
      imageUrl: gameMetadata.imageUrl,
      imageExt: gameMetadata.ext,
    })
    .from(gameMetadata)
    .fullJoin(game, eq(game.bggId, gameMetadata.bggId))
    .orderBy(asc(bggId));
  return toGamesMap(rows);
}
