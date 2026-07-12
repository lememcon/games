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
