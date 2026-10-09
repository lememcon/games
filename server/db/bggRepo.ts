import { eq, sql } from "drizzle-orm";
import type {
  AnyPgColumn,
  PgDatabase,
  PgQueryResultHKT,
} from "drizzle-orm/pg-core";

import type { BggGame } from "../bgg/client";
import type { BggRepo } from "../types";
import * as schema from "./schema";
import { appSetting, gameMetadata } from "./schema";

/** Satisfied by both the node-postgres client and PGlite (tests). */
export type BggDb = PgDatabase<PgQueryResultHKT, typeof schema>;

const CUSTOM = "custom";

export function createBggRepo(db: BggDb): BggRepo {
  return {
    async getSetting(key) {
      const [row] = await db
        .select({ value: appSetting.value, updatedAt: appSetting.updatedAt })
        .from(appSetting)
        .where(eq(appSetting.key, key));
      return row ?? null;
    },

    async setSetting(key, value, updatedBy) {
      await db
        .insert(appSetting)
        .values({ key, value, updatedBy })
        .onConflictDoUpdate({
          target: appSetting.key,
          set: { value, updatedBy, updatedAt: new Date() },
        });
    },

    async deleteSetting(key) {
      await db.delete(appSetting).where(eq(appSetting.key, key));
    },

    listMetadata: () => db.select().from(gameMetadata),

    upsertMetadata: (games, fetchedAt) => upsertMetadata(db, games, fetchedAt),
  };
}

/**
 * Inserts or refreshes metadata rows. Stored values survive a null in the
 * incoming row, and a "custom" image keeps its image and extension. Shared with
 * the game data import so there is one set of rules.
 */
export async function upsertMetadata(
  db: BggDb,
  games: BggGame[],
  fetchedAt: Date,
) {
  if (games.length === 0) return;
  const existing = (col: AnyPgColumn) => sql`${col}`;
  const excluded = (name: string) => sql`excluded.${sql.identifier(name)}`;
  const isCustom = sql`${existing(gameMetadata.imageUrl)} = ${CUSTOM}`;
  await db
    .insert(gameMetadata)
    .values(games.map((g) => ({ ...g, fetchedAt })))
    .onConflictDoUpdate({
      target: gameMetadata.bggId,
      set: {
        minPlayers: sql`coalesce(${excluded("min_players")}, ${existing(gameMetadata.minPlayers)})`,
        maxPlayers: sql`coalesce(${excluded("max_players")}, ${existing(gameMetadata.maxPlayers)})`,
        // A custom image is curated by hand: keep it and its extension.
        imageUrl: sql`case when ${isCustom} then ${existing(gameMetadata.imageUrl)} else coalesce(${excluded("image_url")}, ${existing(gameMetadata.imageUrl)}) end`,
        ext: sql`case when ${isCustom} then ${existing(gameMetadata.ext)} when ${excluded("image_url")} is not null then ${excluded("ext")} else ${existing(gameMetadata.ext)} end`,
        fetchedAt,
      },
    });
}
