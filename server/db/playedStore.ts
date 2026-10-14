import { and, asc, count, eq, inArray } from "drizzle-orm";

import { refuse } from "../result";
import type { AllPlayedGames, PlayedStore } from "../types";
import { appUser, playedCount, score, year as yearTable } from "./schema";
import type { StoreDb } from "./userStore";

const UNKNOWN_YEAR = refuse(404, "unknown_year");
const UNKNOWN_GAME = refuse(404, "unknown_game");
const UNKNOWN_MEMBER = refuse(422, "unknown_member");

type Tx = Parameters<Parameters<StoreDb["transaction"]>[0]>[0];

/** A row means played. */
export function createPlayedStore(db: StoreDb): PlayedStore {
  const yearExists = async (year: number, q: StoreDb | Tx = db) =>
    (
      await q
        .select({ year: yearTable.year })
        .from(yearTable)
        .where(eq(yearTable.year, year))
    ).length > 0;

  /** The subset of `bggIds` with a score row in the year. */
  const gamesInYear = async (
    year: number,
    bggIds: number[],
    q: StoreDb | Tx = db,
  ) =>
    bggIds.length === 0
      ? new Set<number>()
      : new Set(
          (
            await q
              .selectDistinct({ bggId: score.bggId })
              .from(score)
              .where(and(eq(score.year, year), inArray(score.bggId, bggIds)))
          ).map(({ bggId }) => bggId),
        );

  const gameInYear = async (year: number, bggId: number, q = db) =>
    (await gamesInYear(year, [bggId], q)).has(bggId);

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

  const readAll = async (year: number, q: StoreDb | Tx = db) => {
    const rows = await q
      .select({ discordId: playedCount.discordId, bggId: playedCount.bggId })
      .from(playedCount)
      .where(eq(playedCount.year, year))
      .orderBy(asc(playedCount.bggId));
    const all: AllPlayedGames = {};
    for (const { discordId, bggId } of rows)
      (all[discordId] ??= []).push(String(bggId));
    return all;
  };

  return {
    async getAll(year) {
      return (await yearExists(year)) ? readAll(year) : null;
    },

    async get(discordId, year) {
      return (await yearExists(year)) ? read(discordId, year) : null;
    },

    async set(discordId, year, bggId, played) {
      if (!(await yearExists(year))) return UNKNOWN_YEAR;
      if (played) {
        if (!(await gameInYear(year, bggId))) return UNKNOWN_GAME;
        await db
          .insert(playedCount)
          .values({ discordId, year, bggId })
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

    async markPlayed(discordIds, year, bggId) {
      return db.transaction(async (tx) => {
        if (!(await yearExists(year, tx))) return UNKNOWN_YEAR;
        if (!(await gameInYear(year, bggId, tx))) return UNKNOWN_GAME;
        const [{ members }] = await tx
          .select({ members: count() })
          .from(appUser)
          .where(
            and(
              inArray(appUser.discordId, [...discordIds]),
              eq(appUser.status, "approved"),
            ),
          );
        if (members !== discordIds.size) return UNKNOWN_MEMBER;
        await tx
          .insert(playedCount)
          .values(
            [...discordIds].map((discordId) => ({
              discordId,
              year,
              bggId,
            })),
          )
          .onConflictDoNothing();
        return { ok: true as const, value: await readAll(year, tx) };
      });
    },

    async importPlayed(discordId, year, bggIds) {
      if (!(await yearExists(year))) return UNKNOWN_YEAR;
      const known = await gamesInYear(year, [...bggIds]);
      if (known.size > 0)
        await db
          .insert(playedCount)
          .values([...known].map((bggId) => ({ discordId, year, bggId })))
          .onConflictDoNothing();
      return { ok: true, value: await read(discordId, year) };
    },

    async clear(discordId, year) {
      if (!(await yearExists(year))) return UNKNOWN_YEAR;
      await db
        .delete(playedCount)
        .where(
          and(eq(playedCount.discordId, discordId), eq(playedCount.year, year)),
        );
      return { ok: true, value: null };
    },
  };
}
