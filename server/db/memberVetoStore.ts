import { and, asc, eq } from "drizzle-orm";

import { refuse } from "../result";
import type { MemberVetoStore } from "../types";
import { game, memberVeto } from "./schema";
import type { StoreDb } from "./userStore";

export function createMemberVetoStore(db: StoreDb): MemberVetoStore {
  return {
    getAll() {
      return db
        .select({ discordId: memberVeto.discordId, bggId: memberVeto.bggId })
        .from(memberVeto);
    },

    listMine(discordId) {
      return db
        .select({ bggId: memberVeto.bggId, name: game.name })
        .from(memberVeto)
        .leftJoin(game, eq(game.bggId, memberVeto.bggId))
        .where(eq(memberVeto.discordId, discordId))
        .orderBy(asc(game.name), asc(memberVeto.bggId));
    },

    async set(discordId, bggId) {
      const [knownGame] = await db
        .select({ bggId: game.bggId })
        .from(game)
        .where(eq(game.bggId, bggId));
      if (!knownGame) return refuse(404, "unknown_game");
      await db
        .insert(memberVeto)
        .values({ discordId, bggId })
        .onConflictDoNothing();
      return { ok: true, value: null };
    },

    async clear(discordId, bggId) {
      await db
        .delete(memberVeto)
        .where(
          and(eq(memberVeto.discordId, discordId), eq(memberVeto.bggId, bggId)),
        );
    },
  };
}
