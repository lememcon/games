import { and, eq, inArray, ne, or, sql } from "drizzle-orm";

import { collapseMemberScores, toProfileStats } from "../shape";
import type { ProfileStore } from "../types";
import { lockDisplayNames, pgCode } from "./import";
import { account, appUser, game, player, score, user } from "./schema";
import type { StoreDb } from "./userStore";

const UNIQUE_VIOLATION = "23505";

/** Writes old and new display names to the server log. */
const logChange = (discordId: string, from: string | null, to: string | null) =>
  console.info(
    `display name change for ${discordId}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`,
  );

export function createProfileStore(
  db: StoreDb,
  log: typeof logChange = logChange,
): ProfileStore {
  return {
    async setDisplayName(discordId, displayName) {
      try {
        return await db.transaction(async (tx) => {
          await lockDisplayNames(tx);
          const [current] = await tx
            .select({ displayName: appUser.displayName })
            .from(appUser)
            .where(eq(appUser.discordId, discordId))
            .for("update");
          if (!current)
            return { ok: false as const, status: 404, error: "not_found" };

          if (displayName !== null) {
            const lowered = sql`lower(${displayName})`;
            const [memberClash] = await tx
              .select({ id: appUser.discordId })
              .from(appUser)
              .where(
                and(
                  sql`lower(${appUser.displayName}) = ${lowered}`,
                  ne(appUser.discordId, discordId),
                ),
              )
              .limit(1);
            const [playerClash] = await tx
              .select({ id: player.id })
              .from(player)
              .where(
                and(
                  sql`lower(${player.name}) = ${lowered}`,
                  or(
                    sql`${player.discordId} is null`,
                    ne(player.discordId, discordId),
                  ),
                ),
              )
              .limit(1);
            if (memberClash || playerClash)
              return { ok: false as const, status: 409, error: "name_taken" };
          }

          await tx
            .update(appUser)
            .set({ displayName })
            .where(eq(appUser.discordId, discordId));
          log(discordId, current.displayName, displayName);
          return { ok: true as const, value: { displayName } };
        });
      } catch (error) {
        // A concurrent change took the name between the check and the write.
        if (pgCode(error) === UNIQUE_VIOLATION)
          return { ok: false, status: 409, error: "name_taken" };
        throw error;
      }
    },

    async getProfile(discordId) {
      const [member] = await db
        .select({
          displayName: appUser.displayName,
          discordName: user.name,
          image: user.image,
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
        .where(
          and(eq(appUser.discordId, discordId), eq(appUser.status, "approved")),
        );
      if (!member) return null;

      const linked = await db
        .select({ id: player.id, name: player.name })
        .from(player)
        .where(eq(player.discordId, discordId));
      const scores = linked.length
        ? collapseMemberScores(
            (
              await db
                .select({
                  id: score.id,
                  year: score.year,
                  bggId: score.bggId,
                  game: sql<string>`coalesce(${game.name}, '')`,
                  score: score.score,
                  rank: score.rank,
                })
                .from(score)
                .innerJoin(game, eq(game.bggId, score.bggId))
                .where(
                  inArray(
                    score.playerId,
                    linked.map((p) => p.id),
                  ),
                )
            ).map((r) => ({ ...r, owner: discordId })),
          )
        : null;

      const [{ plays: totalPlays }] = await db
        .select({ plays: sql<number>`count(*)::int` })
        .from(score);

      return {
        discordId,
        name: member.displayName ?? member.discordName ?? "Unknown",
        image: member.image,
        linkedPlayers: linked
          .map((p) => p.name)
          .sort((a, b) => a.localeCompare(b)),
        stats: toProfileStats(scores),
        totalPlays,
      };
    },
  };
}
