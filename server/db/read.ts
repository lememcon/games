import { and, asc, desc, eq, sql, sum } from "drizzle-orm";

import {
  collapseMemberScores,
  createNameResolver,
  toGamesMap,
  toLegacyRow,
} from "../shape";
import type {
  GamesMap,
  LegacyScoreRow,
  MutationResult,
  YearTotal,
} from "../types";
import {
  account,
  appUser,
  game,
  gameMetadata,
  player,
  score,
  user,
  year,
} from "./schema";
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
 * display name, else their Discord name (unless it clashes with another name;
 * see `createNameResolver`), else the data-file name, and carry their
 * `discord_id` and, when the member has one, `discord_image`. A member's names share one shown name, and when several of
 * them scored the same game only the best row is kept.
 */
export async function getScores(
  db: StoreDb,
  value: number,
  resolveNames = false,
): Promise<LegacyScoreRow[] | null> {
  const [found] = await db.select().from(year).where(eq(year.year, value));
  if (!found) return null;
  const on = (condition: ReturnType<typeof eq>) =>
    resolveNames ? condition : sql`false`;
  const rows = await db
    .select({
      id: score.id,
      bggId: score.bggId,
      gameName: game.name,
      dataName: player.name,
      displayName: appUser.displayName,
      discordName: user.name,
      discordId: resolveNames ? appUser.discordId : sql<null>`null`,
      discordImage: resolveNames ? user.image : sql<null>`null`,
      score: score.score,
      rank: score.rank,
    })
    .from(score)
    .innerJoin(game, eq(game.bggId, score.bggId))
    .innerJoin(player, eq(player.id, score.playerId))
    .leftJoin(
      appUser,
      and(
        on(eq(appUser.discordId, player.discordId)),
        eq(appUser.status, "approved"),
      ),
    )
    .leftJoin(
      account,
      and(
        on(eq(account.accountId, appUser.discordId)),
        eq(account.providerId, "discord"),
      ),
    )
    .leftJoin(user, on(eq(user.id, account.userId)))
    .where(eq(score.year, value))
    .orderBy(asc(score.id));
  if (!resolveNames)
    return rows.map((r) => toLegacyRow({ ...r, playerName: r.dataName }));
  const [players, members] = await Promise.all([
    db
      .select({
        id: player.id,
        name: player.name,
        discordId: player.discordId,
      })
      .from(player),
    db
      .select({
        discordId: appUser.discordId,
        displayName: appUser.displayName,
        discordName: user.name,
      })
      .from(appUser)
      .leftJoin(
        account,
        and(
          eq(account.accountId, appUser.discordId),
          eq(account.providerId, "discord"),
        ),
      )
      .leftJoin(user, eq(user.id, account.userId))
      .where(eq(appUser.status, "approved")),
  ]);
  const resolve = createNameResolver(players, members);
  return collapseMemberScores(
    rows.map((r) => ({ ...r, year: value, owner: r.discordId })),
  ).map((r) => toLegacyRow({ ...r, playerName: resolve(r) }));
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

/** Sum of every score per game and year; names no players. */
export async function getYearTotals(db: StoreDb): Promise<YearTotal[]> {
  const total = sum(score.score).mapWith(Number);
  const rows = await db
    .select({ year: score.year, bggId: score.bggId, total })
    .from(score)
    .groupBy(score.year, score.bggId)
    .orderBy(asc(score.year), asc(score.bggId));
  return rows.map((r) => ({ year: r.year, bgg_id: r.bggId, total: r.total }));
}
