import { and, asc, desc, eq, isNotNull, notExists, sql } from "drizzle-orm";

import {
  collapseMemberScores,
  createNameResolver,
  toGamesMap,
  toLegacyRow,
  topGames,
} from "../shape";
import type {
  GamesMap,
  LegacyScoreRow,
  MemberTopGame,
  MutationResult,
  UnplayedGame,
  YearTotal,
} from "../types";
import { DATA_VERSION_KEY } from "./import";
import {
  account,
  appSetting,
  appUser,
  game,
  gameMetadata,
  player,
  score,
  user,
  year,
} from "./schema";
import type { StoreDb } from "./userStore";

/** Changes on every import; "0" when none has happened yet. */
export async function getDataVersion(db: StoreDb): Promise<string> {
  const [row] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, DATA_VERSION_KEY));
  return row?.value ?? "0";
}

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
      color: resolveNames ? appUser.color : sql<null>`null`,
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

/**
 * A member's ten highest scores in a year, collapsed across their linked
 * names; approved members only. Null when the year is unknown.
 */
export async function getTopGames(
  db: StoreDb,
  value: number,
  discordId: string,
): Promise<MemberTopGame[] | null> {
  const [found] = await db.select().from(year).where(eq(year.year, value));
  if (!found) return null;
  const rows = await db
    .select({
      id: score.id,
      bggId: score.bggId,
      score: score.score,
      rank: score.rank,
    })
    .from(score)
    .innerJoin(player, eq(player.id, score.playerId))
    .innerJoin(
      appUser,
      and(
        eq(appUser.discordId, player.discordId),
        eq(appUser.status, "approved"),
      ),
    )
    .where(and(eq(score.year, value), eq(appUser.discordId, discordId)));
  return topGames(rows.map((r) => ({ ...r, year: value, owner: discordId })));
}

/** Every game with metadata or a name, including those with no scores. */
export async function getGames(
  db: StoreDb,
  coverBaseUrl?: string,
): Promise<GamesMap> {
  const bggId = sql<number>`coalesce(${gameMetadata.bggId}, ${game.bggId})`;
  const rows = await db
    .select({
      bggId,
      name: game.name,
      minPlayers: gameMetadata.minPlayers,
      maxPlayers: gameMetadata.maxPlayers,
      imageUrl: gameMetadata.imageUrl,
      imageExt: gameMetadata.ext,
      imageKey: gameMetadata.imageKey,
      imageSource: gameMetadata.imageSource,
    })
    .from(gameMetadata)
    .fullJoin(game, eq(game.bggId, gameMetadata.bggId))
    .orderBy(asc(bggId));
  return toGamesMap(rows, coverBaseUrl);
}

/**
 * Sum of scores per game and year, collapsed per approved member like
 * getScores for approved viewers (best row only), for every viewer including
 * signed-out ones; names no players.
 */
export async function getYearTotals(db: StoreDb): Promise<YearTotal[]> {
  const rows = await db
    .select({
      id: score.id,
      year: score.year,
      bggId: score.bggId,
      score: score.score,
      rank: score.rank,
      owner: appUser.discordId,
    })
    .from(score)
    .innerJoin(player, eq(player.id, score.playerId))
    .leftJoin(
      appUser,
      and(
        eq(appUser.discordId, player.discordId),
        eq(appUser.status, "approved"),
      ),
    );
  const totals = new Map<string, YearTotal>();
  for (const r of collapseMemberScores(rows)) {
    const key = `${r.year}|${r.bggId}`;
    const cur = totals.get(key) ?? { year: r.year, bgg_id: r.bggId, total: 0 };
    cur.total += r.score;
    totals.set(key, cur);
  }
  return [...totals.values()].sort(
    (a, b) => a.year - b.year || a.bgg_id - b.bgg_id,
  );
}

/** Named games with no score row in any year, sorted by name. */
export async function listUnplayedGames(db: StoreDb): Promise<UnplayedGame[]> {
  const rows = await db
    .select({ bggId: game.bggId, name: game.name })
    .from(game)
    .where(
      and(
        isNotNull(game.name),
        notExists(
          db
            .select({ one: sql`1` })
            .from(score)
            .where(eq(score.bggId, game.bggId)),
        ),
      ),
    )
    .orderBy(asc(sql`lower(${game.name})`), asc(game.name), asc(game.bggId));
  return rows.map((r) => ({ bgg_id: r.bggId, name: r.name! }));
}
