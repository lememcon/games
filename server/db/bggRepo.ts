import { and, asc, eq, isNull, like, ne, or, sql } from "drizzle-orm";
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

    async setCover(bggId, key, source) {
      const rows = await db
        .update(gameMetadata)
        .set({ imageKey: key, imageSource: source })
        .where(
          and(eq(gameMetadata.bggId, bggId), eq(gameMetadata.imageUrl, source)),
        )
        .returning({ bggId: gameMetadata.bggId });
      return rows.length > 0;
    },

    async setCustomCover(bggId, key) {
      const rows = await db
        .update(gameMetadata)
        .set({ imageUrl: CUSTOM, imageKey: key, imageSource: CUSTOM })
        .where(eq(gameMetadata.bggId, bggId))
        .returning({ bggId: gameMetadata.bggId });
      return rows.length > 0;
    },

    async listCoverNeeds() {
      const rows = await db
        .select({ bggId: gameMetadata.bggId, imageUrl: gameMetadata.imageUrl })
        .from(gameMetadata)
        .where(
          and(
            like(gameMetadata.imageUrl, "https://%"),
            or(
              isNull(gameMetadata.imageSource),
              ne(gameMetadata.imageSource, CUSTOM),
            ),
            or(
              isNull(gameMetadata.imageKey),
              isNull(gameMetadata.imageSource),
              ne(gameMetadata.imageSource, gameMetadata.imageUrl),
            ),
          ),
        )
        .orderBy(asc(gameMetadata.bggId));
      return rows.map((r) => ({ bggId: r.bggId, imageUrl: r.imageUrl! }));
    },
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
