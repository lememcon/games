import type { BggGame } from "./bgg/client";
import type { BggService } from "./bgg/service";
import type { NormalizedImport } from "./import";

export type Role = "member" | "admin";
export type Status = "pending" | "approved";

/** The signed-in user as resolved from a session. */
export interface AppUser {
  /** Immutable Discord snowflake; the identity used for all role checks. */
  discordId: string;
  /** Shown name: the display name if set, else the Discord name. */
  name: string;
  /** The name the member chose, if any. */
  displayName: string | null;
  /** Name from the Discord profile. */
  discordName: string;
  image: string | null;
  role: Role;
  status: Status;
}

export interface AdminUser {
  discordId: string;
  name: string;
  /** Name the member chose, if any. */
  displayName: string | null;
  image: string | null;
  /** Discord username; differs from the spoofable display name. */
  username: string | null;
  role: Role;
  status: Status;
  /** Built-in admins cannot be changed or removed. */
  locked: boolean;
  createdAt: string;
}

export interface ResolvedSession {
  user: AppUser | null;
  headers?: Headers;
}

export interface AppDeps {
  /** Public origin of this API, e.g. https://api.lememcon.com. */
  baseUrl: string;
  /** Origin of the SPA allowed to call the API with credentials (CORS/CSRF). */
  webOrigin?: string;
  /**
   * Resolves the signed-in user from the request headers (null if anonymous).
   * `headers` carries any refreshed session Set-Cookie to forward.
   */
  resolveSession: (headers: Headers) => Promise<ResolvedSession>;
  /** Better Auth's request handler, mounted at /api/auth/*. */
  authHandler: (request: Request) => Promise<Response>;
  /** Persistence for the admin routes. */
  store: UserStore;
  /** Display names and public profiles. */
  profiles: ProfileStore;
  /** Each member's played counts. */
  played: PlayedStore;
  /** BoardGameGeek data admin routes; omitted in tests that do not need them. */
  bgg?: BggService;
  /** Years, games and scores: public reads and the admin import. */
  data: DataStore;
  /** Links between players and app members (admin only). */
  links: LinkStore;
}

export type AppEnv = { Variables: { user: AppUser | null } };

export interface UserRow {
  role: Role;
  status: Status;
}

/** A user row with the name the member chose, if any. */
export interface UserRecord extends UserRow {
  displayName: string | null;
}

/** Why a change was refused; `status` is the HTTP status to answer with. */
export interface Refusal {
  ok: false;
  status: 400 | 403 | 404 | 409;
  error: string;
}

export type MutationResult<T> = { ok: true; value: T } | Refusal;

/** All SQL for app users lives behind this interface (server/db/userStore.ts). */
export interface UserStore {
  /** Discord ids linked to a Better Auth user (exactly one is expected). */
  discordIds(userId: string): Promise<string[]>;
  /** Returns the row, creating a pending member when none exists. */
  getOrCreate(discordId: string): Promise<UserRecord>;
  /** Forces a built-in admin's row to admin/approved; writes only on mismatch. */
  repairProtected(discordId: string): Promise<void>;
  list(): Promise<StoredUser[]>;
  /** Validates and applies a change in one transaction as `actorId`. */
  update(
    actorId: string,
    targetId: string,
    body: unknown,
  ): Promise<MutationResult<StoredUser>>;
  /** Deletes the target's sessions and row in one transaction. */
  remove(actorId: string, targetId: string): Promise<MutationResult<null>>;
}

/** A stored app user joined with its Better Auth profile, before `effectiveUser`. */
export interface StoredUser extends UserRecord {
  discordId: string;
  name: string | null;
  image: string | null;
  username: string | null;
  createdAt: Date;
}

/** A stored app setting; secret values are ciphertext. */
export interface SettingRow {
  value: string;
  updatedAt: Date;
}

export interface GameMetadataRow extends BggGame {
  fetchedAt: Date;
}

/** All SQL for BGG data lives behind this interface (server/db/bggRepo.ts). */
export interface BggRepo {
  getSetting(key: string): Promise<SettingRow | null>;
  setSetting(key: string, value: string, updatedBy: string): Promise<void>;
  deleteSetting(key: string): Promise<void>;
  listMetadata(): Promise<GameMetadataRow[]>;
  /**
   * Inserts or refreshes rows. A row whose image is the "custom" sentinel keeps
   * its image and extension; fields BGG omitted keep their stored value.
   */
  upsertMetadata(games: BggGame[], fetchedAt: Date): Promise<void>;
}

/** A score row in the shape the app has always consumed (`player_game_scores`). */
export interface LegacyScoreRow {
  bgg_id: number;
  game: string;
  player: string;
  score: number;
  rank: number;
  /** Linked approved member; only present in responses to approved sessions. */
  discord_id?: string;
}

/** A score joined with its game and player names, as read from the database. */
export interface ScoreRow {
  bggId: number;
  gameName: string | null;
  playerName: string;
  score: number;
  rank: number;
  discordId?: string | null;
}

export interface GameRow {
  bggId: number;
  name: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  imageUrl: string | null;
  imageExt: string | null;
}

/** The games.json shape, keyed by bgg_id. */
export type GamesMap = Record<
  string,
  { players?: { min: number; max: number }; image?: string; ext?: string }
>;

export interface ImportSummary {
  year: number | null;
  scores: number;
  games: { new: number; updated: number };
  players: { new: number; total: number };
  warnings: string[];
}

export interface ImportContext {
  /** Discord id of the importing admin. */
  importedBy: string;
  sourceFilename: string | null;
}

/** All SQL for years, games and scores lives behind this interface (server/db/dataStore.ts). */
export interface DataStore {
  /** Newest first. */
  listYears(): Promise<number[]>;
  /** Null when the year is unknown. */
  getScores(
    year: number,
    /** Approved callers get display names and `discord_id`; others the data-file name. */
    resolveNames?: boolean,
  ): Promise<LegacyScoreRow[] | null>;
  getGames(): Promise<GamesMap>;
  /** One transaction; refuses with 409 when the year already exists. */
  importData(
    input: NormalizedImport,
    context: ImportContext,
  ): Promise<MutationResult<ImportSummary>>;
}

/** A player with its score count and the app member it is linked to, if any. */
export interface PlayerLink {
  id: number;
  name: string;
  scoreCount: number;
  discordId: string | null;
  /** Better Auth display name of the linked member; null when unlinked. */
  userName: string | null;
}

/** An app member a player can be linked to. */
export interface LinkableUser {
  discordId: string;
  name: string;
  status: Status;
}

export interface PlayerLinks {
  players: PlayerLink[];
  users: LinkableUser[];
}

/** All SQL for player-to-member links lives behind this interface (server/db/linkStore.ts). */
export interface LinkStore {
  /** Players unlinked first, then by lower(name); members by name. */
  list(): Promise<PlayerLinks>;
  /**
   * Null unlinks. Refuses with 404 `unknown_player` or `unknown_user`, and with
   * 409 `name_taken` (the player's name is another member's display name) or
   * `already_linked` (the member is linked to another player).
   */
  setLink(
    playerId: number,
    discordId: string | null,
  ): Promise<MutationResult<null>>;
}

/** One score of a member's linked player, for profile stats. */
export interface ProfileScore {
  bggId: number;
  game: string;
  score: number;
  rank: number;
}

export interface MostPlayedGame {
  bggId: number;
  game: string;
  plays: number;
  /** Best (lowest) rank and the best score achieved at that rank. */
  bestRank: number;
  bestScore: number;
}

export interface ProfileStats {
  games: number;
  wins: number;
  /** Fraction from 0 to 1. */
  winRate: number;
  avgRank: number;
  /** Finishes in the top three. */
  podiums: number;
  mostPlayed: MostPlayedGame[];
}

/** A member's public profile; never includes role, status or Discord username. */
export interface Profile {
  discordId: string;
  name: string;
  image: string | null;
  /** Data-file name of the linked player, if an admin linked one. */
  linkedPlayer: string | null;
  /** Null when no player is linked. */
  stats: ProfileStats | null;
}

/** All SQL for display names and profiles lives behind this interface (server/db/profileStore.ts). */
export interface ProfileStore {
  /**
   * Null clears. Refuses with 409 `name_taken` when another member or a player
   * not linked to this member has the name (case-insensitive).
   */
  setDisplayName(
    discordId: string,
    displayName: string | null,
  ): Promise<MutationResult<{ displayName: string | null }>>;
  /** Null unless the id is an approved member. */
  getProfile(discordId: string): Promise<Profile | null>;
}

/** A member's play counts for one year, by bgg id; absent means zero. */
export type PlayedCounts = Record<string, number>;

/** All SQL for played counts lives behind this interface (server/db/playedStore.ts). */
export interface PlayedStore {
  /** Null when the year is unknown. */
  get(discordId: string, year: number): Promise<PlayedCounts | null>;
  /** Sets the count; 0 deletes the row. Refuses with 404 `unknown_year`. */
  set(
    discordId: string,
    year: number,
    bggId: number,
    count: number,
  ): Promise<MutationResult<null>>;
  /**
   * Adds only the games the member has no count for (the stored count wins) and
   * returns all their counts for the year. Refuses with 404 `unknown_year`.
   */
  importCounts(
    discordId: string,
    year: number,
    counts: Map<number, number>,
  ): Promise<MutationResult<PlayedCounts>>;
}
