// Better Auth core tables (user, session, account, verification).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  /** Discord username (the display name in `name` can be spoofed). */
  username: text("username"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    // One Discord identity per login, one login per Discord identity.
    unique("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    unique("account_user_provider_unique").on(table.userId, table.providerId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/** Authorization state, keyed by the immutable Discord snowflake. */
export const appUser = pgTable(
  "app_user",
  {
    discordId: text("discord_id").primaryKey(),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check("app_user_role_check", sql`${table.role} in ('member', 'admin')`),
    check(
      "app_user_status_check",
      sql`${table.status} in ('pending', 'approved')`,
    ),
  ],
);

/** Server-side settings. Secret values are stored encrypted (server/secrets.ts). */
export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  /** Discord id of the admin who last changed it. */
  updatedBy: text("updated_by"),
});

/** Board Game Geek metadata, keyed by BGG id. `image_url` may be the sentinel "custom". */
export const gameMetadata = pgTable("game_metadata", {
  bggId: integer("bgg_id").primaryKey(),
  minPlayers: integer("min_players"),
  maxPlayers: integer("max_players"),
  imageUrl: text("image_url"),
  ext: text("ext"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

/** An imported year of scores. */
export const year = pgTable("year", {
  year: integer("year").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** Discord id of the admin who imported it. */
  importedBy: text("imported_by"),
  sourceFilename: text("source_filename"),
});

/**
 * Names for games keyed by BoardGameGeek id. Metadata (players, image) lives in
 * `game_metadata`; a game with no name row, or a null name, is metadata-only
 * until a score row names it.
 */
export const game = pgTable("game", {
  bggId: integer("bgg_id").primaryKey(),
  name: text("name"),
});

/** Players are the same person when names differ only by case. */
export const player = pgTable(
  "player",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    /** The app member this player is, if linked. Cleared when the member is deleted. */
    discordId: text("discord_id").references(() => appUser.discordId, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("player_name_lower_idx").on(sql`lower(${table.name})`),
    index("player_discord_id_idx").on(table.discordId),
  ],
);

export const score = pgTable(
  "score",
  {
    id: serial("id").primaryKey(),
    year: integer("year")
      .notNull()
      .references(() => year.year, { onDelete: "cascade" }),
    bggId: integer("bgg_id")
      .notNull()
      .references(() => game.bggId),
    playerId: integer("player_id")
      .notNull()
      .references(() => player.id),
    score: integer("score").notNull(),
    rank: integer("rank").notNull(),
  },
  (table) => [
    unique("score_year_game_player_unique").on(
      table.year,
      table.bggId,
      table.playerId,
    ),
    index("score_year_idx").on(table.year),
  ],
);
