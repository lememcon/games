import { and, eq } from "drizzle-orm";

import { refuse } from "../result";
import type { PlayedCounts, PlayedStore } from "../types";
import { playedCount, year as yearTable } from "./schema";
import type { StoreDb } from "./userStore";

const UNKNOWN_YEAR = refuse(404, "unknown_year");

export function createPlayedStore(db: StoreDb): PlayedStore {
  const yearExists = async (year: number) =>
    (
      await db
        .select({ year: yearTable.year })
        .from(yearTable)
        .where(eq(yearTable.year, year))
    ).length > 0;

  const read = async (discordId: string, year: number) => {
    const rows = await db
      .select({ bggId: playedCount.bggId, count: playedCount.count })
      .from(playedCount)
      .where(
        and(eq(playedCount.discordId, discordId), eq(playedCount.year, year)),
      );
    const counts: PlayedCounts = {};
    for (const { bggId, count } of rows) counts[bggId] = count;
    return counts;
  };

  return {
    async get(discordId, year) {
      return (await yearExists(year)) ? read(discordId, year) : null;
    },

    async set(discordId, year, bggId, count) {
      if (!(await yearExists(year))) return UNKNOWN_YEAR;
      if (count === 0) {
        await db
          .delete(playedCount)
          .where(
            and(
              eq(playedCount.discordId, discordId),
              eq(playedCount.year, year),
              eq(playedCount.bggId, bggId),
            ),
          );
      } else {
        await db
          .insert(playedCount)
          .values({ discordId, year, bggId, count })
          .onConflictDoUpdate({
            target: [
              playedCount.discordId,
              playedCount.year,
              playedCount.bggId,
            ],
            set: { count },
          });
      }
      return { ok: true, value: null };
    },

    async importCounts(discordId, year, counts) {
      if (!(await yearExists(year))) return UNKNOWN_YEAR;
      if (counts.size > 0)
        await db
          .insert(playedCount)
          .values(
            [...counts].map(([bggId, count]) => ({
              discordId,
              year,
              bggId,
              count,
            })),
          )
          .onConflictDoNothing();
      return { ok: true, value: await read(discordId, year) };
    },
  };
}
