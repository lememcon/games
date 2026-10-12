import { and, asc, eq } from "drizzle-orm";

import { refuse } from "../result";
import type { AllPlayedGames, PlayedStore } from "../types";
import { playedCount, year as yearTable } from "./schema";
import type { StoreDb } from "./userStore";

const UNKNOWN_YEAR = refuse(404, "unknown_year");

/** A row means played; its count is ignored (the previous release may write above 1). */
export function createPlayedStore(db: StoreDb): PlayedStore {
  const yearExists = async (year: number) =>
    (
      await db
        .select({ year: yearTable.year })
        .from(yearTable)
        .where(eq(yearTable.year, year))
    ).length > 0;

  const read = async (discordId: string, year: number) =>
    (
      await db
        .select({ bggId: playedCount.bggId })
        .from(playedCount)
        .where(
          and(eq(playedCount.discordId, discordId), eq(playedCount.year, year)),
        )
        .orderBy(asc(playedCount.bggId))
    ).map(({ bggId }) => String(bggId));

  return {
    async getAll(year) {
      if (!(await yearExists(year))) return null;
      const rows = await db
        .select({ discordId: playedCount.discordId, bggId: playedCount.bggId })
        .from(playedCount)
        .where(eq(playedCount.year, year))
        .orderBy(asc(playedCount.bggId));
      const all: AllPlayedGames = {};
      for (const { discordId, bggId } of rows)
        (all[discordId] ??= []).push(String(bggId));
      return all;
    },

    async get(discordId, year) {
      return (await yearExists(year)) ? read(discordId, year) : null;
    },

    async set(discordId, year, bggId, played) {
      if (!(await yearExists(year))) return UNKNOWN_YEAR;
      if (played) {
        await db
          .insert(playedCount)
          .values({ discordId, year, bggId, count: 1 })
          .onConflictDoNothing();
      } else {
        await db
          .delete(playedCount)
          .where(
            and(
              eq(playedCount.discordId, discordId),
              eq(playedCount.year, year),
              eq(playedCount.bggId, bggId),
            ),
          );
      }
      return { ok: true, value: null };
    },

    async importPlayed(discordId, year, bggIds) {
      if (!(await yearExists(year))) return UNKNOWN_YEAR;
      if (bggIds.size > 0)
        await db
          .insert(playedCount)
          .values(
            [...bggIds].map((bggId) => ({ discordId, year, bggId, count: 1 })),
          )
          .onConflictDoNothing();
      return { ok: true, value: await read(discordId, year) };
    },
  };
}
