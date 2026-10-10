// Shared domain model for the app. Types are derived from how the data is
// actually consumed in the components, hooks, and lib.

// A single per-player score row from the `player_game_scores` array served by
// GET /api/years/:year/scores.
export interface PlayerGameScore {
  bgg_id: number;
  game: string;
  player: string;
  score: number;
  rank: number;
  // Only sent to approved users, and only for players linked to a member.
  discord_id?: string;
  // Discord avatar URL; sent with discord_id.
  discord_image?: string;
}

// The value shape served by GET /api/games, keyed by BoardGameGeek id
// (string). Custom or imageless games have a null image; bounds may be null.
export interface GameMeta {
  // BGG's range.
  players?: { min: number | null; max: number | null };
  image?: string | null;
  ext?: string | null;
}

export type GamesData = Record<string, GameMeta>;

// Player-count bounds for a game (see gameBounds in src/lib/games.ts).
export interface Bounds {
  min: number;
  max: number;
}

// What useData returns. The by_* maps group the score rows; each grouping
// removes one key at runtime (dissoc), but no consumer reads the removed key,
// so they are typed pragmatically as full rows.
export interface Data {
  loading: boolean;
  // Set when the remote fetch fails, so the app can show an error state.
  error?: boolean;
  scores: PlayerGameScore[];
  by_game: Record<string, PlayerGameScore[]>;
  by_player: Record<string, PlayerGameScore[]>;
  by_id: Record<string, PlayerGameScore[]>;
  max: number;
}

// A player's contribution to a game, as aggregated by buildSelectedGames.
export interface SelectedGamePlayer {
  name: string;
  rank: number;
  score: number;
  discordId?: string;
  // https avatar URL of the linked member.
  discordImage?: string;
}

// An aggregated game row produced by buildSelectedGames.
export interface SelectedGame {
  name: string;
  score: number;
  id: string;
  min: number;
  max: number;
  players: Record<string, SelectedGamePlayer>;
  // Selected players (or all, when none are selected) who played this game
  // this year, by name; only counts above zero.
  playedBy: Record<string, number>;
  image?: string;
}

// How the game list is ordered: by total score, by the least happy scorer's
// rank, or by how evenly the scorers did.
export type SortMode = "total" | "lowest" | "even";

// One subgroup of a suggested split: its members, their top games (every member
// scored them) and the name of the game the headline plan picks for the group.
export interface SplitGroup {
  players: string[];
  games: SelectedGame[];
  picked: string;
}

// A suggested way to divide the selected players into two smaller groups.
// perPlayer is the picked games' summed score over the player count; delta is
// perPlayer minus the best all-together game, or null when there is none.
export interface GameSplit {
  groups: SplitGroup[];
  perPlayer: number;
  delta: number | null;
}

// Account model served by the API (GET /api/me, GET /api/admin/users).
export type Role = "member" | "admin";
export type Status = "pending" | "approved";

export interface MeUser {
  discordId: string;
  name: string;
  image: string | null;
}

// `name` is the resolved name (display name, else the Discord name).
export interface ApprovedUser extends MeUser {
  displayName: string | null;
  discordName: string;
  role: Role;
}

export type Me =
  | { status: "anonymous" }
  | { status: "pending"; user: MeUser }
  | { status: "approved"; user: ApprovedUser };

export interface AdminUser {
  discordId: string;
  // The Discord name; displayName is the member's own choice, if any.
  name: string;
  displayName: string | null;
  image: string | null;
  username: string | null;
  role: Role;
  status: Status;
  // True for built-in admins, which the server refuses to change.
  locked: boolean;
  createdAt: string;
}

// Public profiles (GET /api/profiles/:discordId) and the display-name setter
// (PUT /api/me/display-name).
export interface TopGame {
  bggId: number;
  game: string;
  rank: number;
  score: number;
}

export interface YearTopGames {
  year: number;
  // All scores that year; `games` holds at most the best few.
  total: number;
  games: TopGame[];
}

export interface ProfileStats {
  // Years with at least one score.
  years: number;
  topByYear: YearTopGames[];
}

export interface Profile {
  discordId: string;
  name: string;
  image: string | null;
  linkedPlayers: string[];
  // Null when no score-sheet player is linked to the member.
  stats: ProfileStats | null;
  // Recorded plays (sum of played_count) across all members and years.
  totalPlays: number;
}

export interface DisplayNameResult {
  name: string;
  displayName: string | null;
}

// Player links admin (GET /api/admin/player-links): which app member, if any,
// each score-sheet player is.
export interface PlayerLink {
  id: number;
  name: string;
  scoreCount: number;
  discordId: string | null;
  // Display name of the linked member; null when unlinked.
  userName: string | null;
}

export interface LinkableUser {
  discordId: string;
  name: string;
  status: Status;
}

export interface PlayerLinks {
  players: PlayerLink[];
  users: LinkableUser[];
}

// BoardGameGeek data admin (GET/PUT /api/admin/bgg/*). The key itself is never
// returned: only whether it is set and a masked tail.
export interface BggKeyInfo {
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
  // The stored key no longer decrypts and must be entered again.
  unreadable?: boolean;
}

export interface BggKeyTest {
  ok: boolean;
  status: "valid" | "invalid" | "rate_limited" | "error";
  message: string;
  rateLimited?: boolean;
}

export type BggGameState = "loaded" | "missing" | "partial";

export interface BggGameRow {
  bggId: number;
  name: string;
  years: number[];
  state: BggGameState;
  hasPlayers: boolean;
  hasImage: boolean;
  fetchedAt: string | null;
}

export type BggJobState = "idle" | "running" | "done" | "failed" | "cancelled";

export interface BggJob {
  state: BggJobState;
  mode: "missing" | "ids" | null;
  total: number;
  done: number;
  updated: number;
  notFound: number;
  batchesTotal: number;
  batchesDone: number;
  errors: string[];
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BggTotals {
  needed: number;
  loaded: number;
  missing: number;
  partial: number;
}

export interface BggStatus {
  keyConfigured: boolean;
  totals: BggTotals;
  games: BggGameRow[];
  job: BggJob;
  // Set client-side when the server could not read the score feeds (502).
  scoresUnavailable?: boolean;
}

export type BggDownloadRequest =
  { mode: "missing" } | { mode: "ids"; ids: number[] };

// 201 body of POST /api/admin/import. `year` is null for a games-only upload.
export interface ImportResult {
  year: number | null;
  scores: number;
  games: { new: number; updated: number };
  players: { new: number; total: number };
  warnings: string[];
}

// One entry of the 422 body of POST /api/admin/import.
export interface ImportProblem {
  path: string;
  message: string;
}

// Every member's play counts for a year: discord id, then bgg id. Body of
// GET /api/played.
export interface AllPlayedCountsResponse {
  counts: Record<string, Record<string, number>>;
}

// The signed-in member's play counts for a year, by bgg id; absent means zero.
// Body of GET /api/me/played and of POST /api/me/played/:year/import.
export interface PlayedCountsResponse {
  counts: Record<string, number>;
}

// One member's own player count range for a game, narrowing the game's range.
// Everyone's overrides come as a flat list in the body of GET /api/player-overrides.
export interface PlayerOverride {
  discordId: string;
  bggId: number;
  min: number;
  max: number;
}

// One game's summed scores in one year, from GET /api/years/totals.
export interface YearTotal {
  year: number;
  bgg_id: number;
  total: number;
}
