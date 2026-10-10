import { and, asc, desc, eq } from "drizzle-orm";

import { refuse } from "../result";
import type { MemberVetoStore } from "../types";
import { game, memberVeto, year as yearTable } from "./schema";
import type { StoreDb } from "./userStore";

export function createMemberVetoStore(db: StoreDb): MemberVetoStore {
  return {
    async getAll(year) {
      const found = await db
        .select({ year: yearTable.year })
        .from(yearTable)
        .where(eq(yearTable.year, year));
      if (found.length === 0) return null;
      return db
        .select({ discordId: memberVeto.discordId, bggId: memberVeto.bggId })
        .from(memberVeto)
        .where(eq(memberVeto.year, year));
    },

    listMine(discordId) {
      return db
        .select({
          year: memberVeto.year,
          bggId: memberVeto.bggId,
          name: game.name,
        })
        .from(memberVeto)
        .leftJoin(game, eq(game.bggId, memberVeto.bggId))
        .where(eq(memberVeto.discordId, discordId))
        .orderBy(desc(memberVeto.year), asc(game.name), asc(memberVeto.bggId));
    },

    async set(discordId, year, bggId) {
      const [knownYear] = await db
        .select({ year: yearTable.year })
        .from(yearTable)
        .where(eq(yearTable.year, year));
      if (!knownYear) return refuse(404, "unknown_year");
      const [knownGame] = await db
        .select({ bggId: game.bggId })
        .from(game)
        .where(eq(game.bggId, bggId));
      if (!knownGame) return refuse(404, "unknown_game");
      await db
        .insert(memberVeto)
        .values({ discordId, year, bggId })
        .onConflictDoNothing();
      return { ok: true, value: null };
    },

    async clear(discordId, year, bggId) {
      await db
        .delete(memberVeto)
        .where(
          and(
            eq(memberVeto.discordId, discordId),
            eq(memberVeto.year, year),
            eq(memberVeto.bggId, bggId),
          ),
        );
    },
  };
}
