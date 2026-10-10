import { and, eq } from "drizzle-orm";

import { refuse } from "../result";
import type { AllMemberOverrides, MemberOverrideStore } from "../types";
import {
  game,
  gameMetadata,
  gamePlayerOverride,
  memberPlayerOverride,
  player,
} from "./schema";
import type { StoreDb } from "./userStore";

export function createMemberOverrideStore(db: StoreDb): MemberOverrideStore {
  return {
    async getAll() {
      const rows = await db
        .select({
          discordId: memberPlayerOverride.discordId,
          bggId: memberPlayerOverride.bggId,
          min: memberPlayerOverride.minPlayers,
          max: memberPlayerOverride.maxPlayers,
        })
        .from(memberPlayerOverride);
      const all: AllMemberOverrides = {};
      for (const { discordId, bggId, min, max } of rows)
        (all[discordId] ??= {})[bggId] = { min, max };
      return all;
    },

    set(discordId, bggId, range) {
      return db.transaction(async (tx) => {
        const linked = await tx
          .select({ id: player.id })
          .from(player)
          .where(eq(player.discordId, discordId))
          .limit(1);
        if (linked.length === 0) return refuse(403, "not_linked");

        const [found] = await tx
          .select({
            minPlayers: gameMetadata.minPlayers,
            maxPlayers: gameMetadata.maxPlayers,
            overrideMin: gamePlayerOverride.minPlayers,
            overrideMax: gamePlayerOverride.maxPlayers,
          })
          .from(game)
          .leftJoin(gameMetadata, eq(gameMetadata.bggId, game.bggId))
          .leftJoin(
            gamePlayerOverride,
            eq(gamePlayerOverride.bggId, game.bggId),
          )
          .where(eq(game.bggId, bggId));
        if (!found) return refuse(404, "unknown_game");

        const min = found.overrideMin ?? found.minPlayers;
        const max = found.overrideMax ?? found.maxPlayers;
        if (min === null || max === null) return refuse(409, "no_player_range");
        if (range.min < min || range.max > max)
          return refuse(400, "out_of_range");

        const values = { minPlayers: range.min, maxPlayers: range.max };
        await tx
          .insert(memberPlayerOverride)
          .values({ discordId, bggId, ...values })
          .onConflictDoUpdate({
            target: [
              memberPlayerOverride.discordId,
              memberPlayerOverride.bggId,
            ],
            set: values,
          });
        return { ok: true as const, value: null };
      });
    },

    async clear(discordId, bggId) {
      await db
        .delete(memberPlayerOverride)
        .where(
          and(
            eq(memberPlayerOverride.discordId, discordId),
            eq(memberPlayerOverride.bggId, bggId),
          ),
        );
    },
  };
}
