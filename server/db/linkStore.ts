import { and, eq, ne, sql } from "drizzle-orm";

import type { LinkStore, PlayerLinks } from "../types";
import { lockDisplayNames, pgCode } from "./import";
import { account, appUser, player, score, user } from "./schema";
import type { StoreDb } from "./userStore";

const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

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
        return await db.transaction(async (tx) => {
          await lockDisplayNames(tx);
          const [found] = await tx
            .select({ name: player.name, discordId: player.discordId })
            .from(player)
            .where(eq(player.id, playerId));
          if (!found)
            return { ok: false as const, status: 404, error: "unknown_player" };

          // The shown name must not impersonate another member. Linking
          // exempts the new member; unlinking checks the member being
          // unlinked, whose display name would now match an unlinked player.
          const unlinking = discordId === null;
          if (!unlinking || found.discordId !== null) {
            const [clash] = await tx
              .select({ id: appUser.discordId })
              .from(appUser)
              .where(
                and(
                  sql`lower(${appUser.displayName}) = lower(${found.name})`,
                  unlinking
                    ? eq(appUser.discordId, found.discordId!)
                    : ne(appUser.discordId, discordId),
                ),
              )
              .limit(1);
            if (clash)
              return { ok: false as const, status: 409, error: "name_taken" };
          }

          await tx
            .update(player)
            .set({ discordId })
            .where(eq(player.id, playerId));
          return { ok: true as const, value: null };
        });
      } catch (error) {
        const code = pgCode(error);
        if (code === FOREIGN_KEY_VIOLATION)
          return { ok: false, status: 404, error: "unknown_user" };
        if (code === UNIQUE_VIOLATION)
          return { ok: false, status: 409, error: "already_linked" };
        throw error;
      }
    },
  };
}
