import { and, asc, desc, eq } from "drizzle-orm";

import { refuse } from "../result";
import type { MemberYearVetoStore } from "../types";
import {
  game,
  gameMetadata,
  memberYearVeto,
  year as yearTable,
} from "./schema";
import type { StoreDb } from "./userStore";

export function createMemberYearVetoStore(db: StoreDb): MemberYearVetoStore {
  const yearExists = async (year: number) =>
    (
      await db
        .select({ year: yearTable.year })
        .from(yearTable)
        .where(eq(yearTable.year, year))
    ).length > 0;

  return {
    async getAll(year) {
      if (!(await yearExists(year))) return null;
      return db
        .select({
          discordId: memberYearVeto.discordId,
          bggId: memberYearVeto.bggId,
        })
        .from(memberYearVeto)
        .where(eq(memberYearVeto.year, year));
    },

    listMine(discordId) {
      return db
        .select({
          year: memberYearVeto.year,
          bggId: memberYearVeto.bggId,
          name: game.name,
          image: gameMetadata.imageUrl,
          ext: gameMetadata.ext,
        })
        .from(memberYearVeto)
        .leftJoin(game, eq(game.bggId, memberYearVeto.bggId))
        .leftJoin(gameMetadata, eq(gameMetadata.bggId, memberYearVeto.bggId))
        .where(eq(memberYearVeto.discordId, discordId))
        .orderBy(
          desc(memberYearVeto.year),
          asc(game.name),
          asc(memberYearVeto.bggId),
        );
    },

    async set(discordId, year, bggId) {
      if (!(await yearExists(year))) return refuse(404, "unknown_year");
      const [knownGame] = await db
        .select({ bggId: game.bggId })
        .from(game)
        .where(eq(game.bggId, bggId));
      if (!knownGame) return refuse(404, "unknown_game");
      await db
        .insert(memberYearVeto)
        .values({ discordId, year, bggId })
        .onConflictDoNothing();
      return { ok: true, value: null };
    },

    async clear(discordId, year, bggId) {
      await db
        .delete(memberYearVeto)
        .where(
          and(
            eq(memberYearVeto.discordId, discordId),
            eq(memberYearVeto.year, year),
            eq(memberYearVeto.bggId, bggId),
          ),
        );
    },
  };
}
