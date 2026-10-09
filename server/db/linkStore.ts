import { eq, sql } from "drizzle-orm";

import type { LinkStore, PlayerLinks } from "../types";
import { pgCode } from "./import";
import { account, appUser, player, score, user } from "./schema";
import type { StoreDb } from "./userStore";

const FOREIGN_KEY_VIOLATION = "23503";

// One Discord account per app_user (unique provider + account id), so these
// joins cannot fan out; a member with no login row is simply not listed.
export function createLinkStore(db: StoreDb): LinkStore {
  const scoreCount = sql<number>`count(${score.id})::int`;
  const linked = sql`(${player.discordId} is not null)`;
  const lowerName = sql`lower(${player.name})`;

  return {
    async list(): Promise<PlayerLinks> {
      const players = await db
        .select({
          id: player.id,
          name: player.name,
          scoreCount,
          discordId: player.discordId,
          userName: user.name,
        })
        .from(player)
        .leftJoin(score, eq(score.playerId, player.id))
        .leftJoin(
          account,
          sql`${account.accountId} = ${player.discordId} and ${account.providerId} = 'discord'`,
        )
        .leftJoin(user, eq(user.id, account.userId))
        .groupBy(player.id, user.name)
        .orderBy(linked, lowerName, player.id);

      const users = await db
        .select({
          discordId: appUser.discordId,
          name: user.name,
          status: appUser.status,
        })
        .from(appUser)
        .innerJoin(
          account,
          sql`${account.accountId} = ${appUser.discordId} and ${account.providerId} = 'discord'`,
        )
        .innerJoin(user, eq(user.id, account.userId))
        .orderBy(sql`lower(${user.name})`, appUser.discordId);

      return {
        players,
        users: users.map((u) => ({
          ...u,
          status: u.status as "pending" | "approved",
        })),
      };
    },

    async setLink(playerId, discordId) {
      try {
        const rows = await db
          .update(player)
          .set({ discordId })
          .where(eq(player.id, playerId))
          .returning({ id: player.id });
        return rows.length
          ? { ok: true, value: null }
          : { ok: false, status: 404, error: "unknown_player" };
      } catch (error) {
        if (pgCode(error) === FOREIGN_KEY_VIOLATION)
          return { ok: false, status: 404, error: "unknown_user" };
        throw error;
      }
    },
  };
}
