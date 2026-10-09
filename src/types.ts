// Shared domain model for the app. Types are derived from how the data is
// actually consumed in the components, hooks, and lib.

// A single per-player score row from the remote `player_game_scores` array
// (https://data.lememcon.com/<year>.json).
export interface PlayerGameScore {
  bgg_id: number;
  game: string;
  player: string;
  score: number;
  rank: number;
}

// The value shape in src/assets/games.json, keyed by BoardGameGeek id (string).
export interface GameMeta {
  players?: { min: number; max: number };
  image?: string;
  ext?: string;
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
}

// An aggregated game row produced by buildSelectedGames.
export interface SelectedGame {
  name: string;
  score: number;
  id: string;
  min: number;
  max: number;
  players: Record<string, SelectedGamePlayer>;
  image?: string;
}

// Account model served by the API (GET /api/me, GET /api/admin/users).
export type Role = "member" | "admin";
export type Status = "pending" | "approved";

export interface MeUser {
  discordId: string;
  name: string;
  image: string | null;
}

export interface ApprovedUser extends MeUser {
  role: Role;
}

export type Me =
  | { status: "anonymous" }
  | { status: "pending"; user: MeUser }
  | { status: "approved"; user: ApprovedUser };

export interface AdminUser {
  discordId: string;
  name: string;
  image: string | null;
  username: string | null;
  role: Role;
  status: Status;
  // True for built-in admins, which the server refuses to change.
  locked: boolean;
  createdAt: string;
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
