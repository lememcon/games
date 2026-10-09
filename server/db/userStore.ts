import { and, eq, inArray, ne, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import {
  effectiveUser,
  isProtected,
  validateChange,
  validateRemove,
} from "../roles";
import type {
  MutationResult,
  Role,
  Status,
  StoredUser,
  UserRow,
  UserStore,
} from "../types";
import * as schema from "./schema";
import { account, appUser, session, user } from "./schema";

/** Satisfied by both the node-postgres client and PGlite (tests). */
export type StoreDb = PgDatabase<PgQueryResultHKT, typeof schema>;
type Tx = Parameters<Parameters<StoreDb["transaction"]>[0]>[0];

const toRow = (r: { role: string; status: string }): UserRow => ({
  role: r.role as Role,
  status: r.status as Status,
});

function selectUsers(db: StoreDb | Tx, discordId?: string) {
  const query = db
    .select({
      discordId: appUser.discordId,
      role: appUser.role,
      status: appUser.status,
      createdAt: appUser.createdAt,
      name: user.name,
      image: user.image,
      username: user.username,
    })
    .from(appUser)
    .leftJoin(
      account,
      and(
        eq(account.accountId, appUser.discordId),
        eq(account.providerId, "discord"),
      ),
    )
    .leftJoin(user, eq(user.id, account.userId));
  return discordId ? query.where(eq(appUser.discordId, discordId)) : query;
}

const toStored = (r: Awaited<ReturnType<typeof selectUsers>>[number]) =>
  ({ ...r, ...toRow(r) }) satisfies StoredUser;

/** The row-lock query: actor and target, locked in discord_id order. */
export const lockQuery = (
  db: StoreDb | Tx,
  actorId: string,
  targetId: string,
) =>
  db
    .select()
    .from(appUser)
    .where(inArray(appUser.discordId, [actorId, targetId]))
    .orderBy(appUser.discordId)
    .for("update");

/**
 * Runs `apply` in a transaction holding row locks on actor and target, taken
 * in discord_id order so concurrent mutations cannot deadlock. The actor is
 * validated against the locked state, so a just-demoted admin is refused.
 */
async function mutate<T>(
  db: StoreDb,
  actorId: string,
  targetId: string,
  apply: (
    tx: Tx,
    actor: UserRow,
    target: UserRow | null,
  ) => Promise<MutationResult<T>>,
): Promise<MutationResult<T>> {
  return db.transaction(async (tx) => {
    const locked = await lockQuery(tx, actorId, targetId);
    const rowOf = (id: string) => {
      const found = locked.find((r) => r.discordId === id);
      return found ? toRow(found) : null;
    };
    return apply(tx, effectiveUser(actorId, rowOf(actorId)), rowOf(targetId));
  });
}

export function createUserStore(db: StoreDb): UserStore {
  return {
    async discordIds(userId) {
      const rows = await db
        .select({ accountId: account.accountId })
        .from(account)
        .where(
          and(eq(account.userId, userId), eq(account.providerId, "discord")),
        );
      return rows.map((r) => r.accountId);
    },

    async getOrCreate(discordId) {
      const find = async () => {
        const [row] = await db
          .select()
          .from(appUser)
          .where(eq(appUser.discordId, discordId));
        return row && toRow(row);
      };
      const existing = await find();
      if (existing) return existing;
      await db.insert(appUser).values({ discordId }).onConflictDoNothing();
      return (await find())!;
    },

    async repairProtected(discordId) {
      if (!isProtected(discordId)) return;
      await db
        .insert(appUser)
        .values({ discordId, role: "admin", status: "approved" })
        .onConflictDoUpdate({
          target: appUser.discordId,
          set: { role: "admin", status: "approved" },
          // Writes only when the row actually differs.
          setWhere: or(
            ne(appUser.role, "admin"),
            ne(appUser.status, "approved"),
          ),
        });
    },

    async list() {
      return (await selectUsers(db)).map(toStored);
    },

    update: (actorId, targetId, body) =>
      mutate(db, actorId, targetId, async (tx, actor, target) => {
        const checked = validateChange(actor, targetId, target, body);
        if (!checked.ok) return checked;
        await tx
          .update(appUser)
          .set(checked.value)
          .where(eq(appUser.discordId, targetId));
        const [updated] = await selectUsers(tx, targetId);
        return { ok: true, value: toStored(updated) };
      }),

    remove: (actorId, targetId) =>
      mutate(db, actorId, targetId, async (tx, actor, target) => {
        const checked = validateRemove(actor, targetId, target);
        if (!checked.ok) return checked;
        const owners = tx
          .select({ userId: account.userId })
          .from(account)
          .where(
            and(
              eq(account.accountId, targetId),
              eq(account.providerId, "discord"),
            ),
          );
        await tx.delete(session).where(inArray(session.userId, owners));
        await tx.delete(appUser).where(eq(appUser.discordId, targetId));
        return checked;
      }),
  };
}
