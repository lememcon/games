import { asc, desc, eq } from "drizzle-orm";

import { toGamesMap, toLegacyRow } from "../shape";
import type { GamesMap, LegacyScoreRow } from "../types";
import { game, player, score, year } from "./schema";
import type { StoreDb } from "./userStore";

/** Newest first. */
export async function listYears(db: StoreDb): Promise<number[]> {
  const rows = await db
    .select({ year: year.year })
    .from(year)
    .orderBy(desc(year.year));
  return rows.map((r) => r.year);
}

/** Null when the year is unknown. Rows come back in insertion order. */
export async function getScores(
  db: StoreDb,
  value: number,
): Promise<LegacyScoreRow[] | null> {
  const [found] = await db.select().from(year).where(eq(year.year, value));
  if (!found) return null;
  const rows = await db
    .select({
      bggId: score.bggId,
      gameName: game.name,
      playerName: player.name,
      score: score.score,
      rank: score.rank,
    })
    .from(score)
    .innerJoin(game, eq(game.bggId, score.bggId))
    .innerJoin(player, eq(player.id, score.playerId))
    .where(eq(score.year, value))
    .orderBy(asc(score.id));
  return rows.map(toLegacyRow);
}

/** Every game, including those with no scores. */
export async function getGames(db: StoreDb): Promise<GamesMap> {
  const rows = await db.select().from(game).orderBy(asc(game.bggId));
  return toGamesMap(rows);
}
