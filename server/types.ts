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
  /** Each member's own player count ranges. */
  memberOverrides: MemberOverrideStore;
  /** Each member's game vetoes, shared by every year. */
  memberVetoes: MemberVetoStore;
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
  /** Linked member's Discord avatar; approved sessions only, with `discord_id`. */
  discord_image?: string;
}

/** A score joined with its game and player names, as read from the database. */
export interface ScoreRow {
  bggId: number;
  gameName: string | null;
  playerName: string;
  score: number;
  rank: number;
  discordId?: string | null;
  discordImage?: string | null;
}

export interface GameRow {
  bggId: number;
  name: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  imageUrl: string | null;
  imageExt: string | null;
}

/** An inclusive player count range. */
export interface PlayerRange {
  min: number;
  max: number;
}

/** The games.json shape, keyed by bgg_id. */
export type GamesMap = Record<
  string,
  {
    /** The game's name; omitted when unknown. */
    name?: string;
    /** BGG's range; present only when BGG lists both bounds. */
    players?: PlayerRange;
    image?: string;
    ext?: string;
  }
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

/** A named game with no scores in any year. */
export interface UnplayedGame {
  bgg_id: number;
  name: string;
}

/** One game's summed scores in one year. */
export interface YearTotal {
  year: number;
  bgg_id: number;
  total: number;
}

/** All SQL for years, games and scores lives behind this interface (server/db/dataStore.ts). */
export interface DataStore {
  /** Newest first. */
  listYears(): Promise<number[]>;
  /** Null when the year is unknown. */
  getScores(
    year: number,
    /** Approved callers get display names, `discord_id` and `discord_image`; others the data-file name. */
    resolveNames?: boolean,
  ): Promise<LegacyScoreRow[] | null>;
  getGames(): Promise<GamesMap>;
  /** Summed scores per game and year, ordered by year then game. */
  getYearTotals(): Promise<YearTotal[]>;
  /** Named games with no score row in any year, by name. */
  listUnplayedGames(): Promise<UnplayedGame[]>;
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
   * 409 `name_taken` (the player's name is another member's display name).
   * A member may be linked to several players.
   */
  setLink(
    playerId: number,
    discordId: string | null,
  ): Promise<MutationResult<null>>;
}

/** One score of a member's linked player, for profile stats. */
export interface ProfileScore {
  year: number;
  bggId: number;
  game: string;
  score: number;
  rank: number;
}

/** One of a member's best finishes in a year. */
export interface TopGame {
  bggId: number;
  game: string;
  rank: number;
  score: number;
}

export interface YearTopGames {
  year: number;
  /** All of the player's scores that year; `games` holds at most the best few. */
  total: number;
  games: TopGame[];
}

export interface ProfileStats {
  /** Years with at least one score. */
  years: number;
  /** Best finishes per year, newest year first; years without scores are absent. */
  topByYear: YearTopGames[];
}

/** A member's public profile; never includes role, status or Discord username. */
export interface Profile {
  discordId: string;
  name: string;
  image: string | null;
  /** Data-file names of the linked players, sorted; empty when none. */
  linkedPlayers: string[];
  /** Null when no player is linked. */
  stats: ProfileStats | null;
  /** Recorded plays (sum of played_count) across all members and years. */
  totalPlays: number;
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

/** Every member's play counts for one year: discord id, then bgg id. */
export type AllPlayedCounts = Record<string, PlayedCounts>;

/** All SQL for played counts lives behind this interface (server/db/playedStore.ts). */
export interface PlayedStore {
  /** Members with at least one play; null when the year is unknown. */
  getAll(year: number): Promise<AllPlayedCounts | null>;
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

/** Every member's own player count ranges: discord id, then bgg id. */
export type AllMemberOverrides = Record<string, Record<string, PlayerRange>>;

/** All SQL for member player count overrides lives behind this interface (server/db/memberOverrideStore.ts). */
export interface MemberOverrideStore {
  getAll(): Promise<AllMemberOverrides>;
  /**
   * Stores the member's range for the game (always, even when equal to the
   * base range). Refuses with 403 `not_linked` (no player is linked to the
   * member), 404 `unknown_game`, 409 `no_player_range` (the game has no base
   * range) and 400 `out_of_range` (the range is not inside BGG's range).
   */
  set(
    discordId: string,
    bggId: number,
    range: PlayerRange,
  ): Promise<MutationResult<null>>;
  /** Removes the member's range; no error when absent. */
  clear(discordId: string, bggId: number): Promise<void>;
}

/** One member's veto of a game, with the game name when known. */
export interface MyVetoRow {
  bggId: number;
  name: string | null;
}

/** All SQL for member game vetoes lives behind this interface (server/db/memberVetoStore.ts). */
export interface MemberVetoStore {
  /** Every member's vetoes; they apply to every year. */
  getAll(): Promise<{ discordId: string; bggId: number }[]>;
  /** The member's vetoes, by name then bgg id. */
  listMine(discordId: string): Promise<MyVetoRow[]>;
  /** Idempotent. Refuses with 404 `unknown_game`. */
  set(discordId: string, bggId: number): Promise<MutationResult<null>>;
  /** Removes the member's veto; no error when absent. */
  clear(discordId: string, bggId: number): Promise<void>;
}
