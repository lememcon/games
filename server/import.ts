/**
 * Pure validation and normalization of an admin upload. Two shapes:
 *
 * - year upload: `{ year, player_game_scores: [...], games? }` creates a year
 * - games-only upload: `{ games: {...} }` (or a bare games.json-shaped map)
 *   only upserts game metadata
 */

export const MAX_ROWS = 20_000;
export const MAX_ERRORS = 50;
const MAX_STRING = 200;
const MAX_IMAGE = 2048;
const MAX_FILENAME = 100;
const INT_MAX = 2_147_483_647;
const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
/** games.json marks hand-picked art with this instead of a URL. */
const CUSTOM_IMAGE = "custom";

export interface ImportIssue {
  path: string;
  message: string;
}

export interface NormalizedGame {
  bggId: number;
  /** Null until a score row names the game. */
  name: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  imageUrl: string | null;
  imageExt: string | null;
}

export interface NormalizedScore {
  bggId: number;
  /** Canonical (first-seen) spelling of the player. */
  player: string;
  score: number;
  rank: number;
}

export interface NormalizedImport {
  /** Null for a games-only upload. */
  year: number | null;
  games: NormalizedGame[];
  /** Distinct players, case-insensitively, in first-seen spelling. */
  players: string[];
  scores: NormalizedScore[];
  warnings: string[];
}

export type ParseResult =
  { ok: true; value: NormalizedImport } | { ok: false; errors: ImportIssue[] };

interface Row {
  bggId: number;
  game: string;
  player: string;
  score: number;
  rank: number;
}

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= INT_MAX;
/** games.json uses 0 for a player count BoardGameGeek does not know. */
const isCount = (v: unknown): v is number => isInt(v) && v >= 0;
const isPositiveInt = (v: unknown): v is number => isInt(v) && v > 0;

/** Truncated user text for error messages, so a response never echoes a huge value. */
const show = (value: string) =>
  JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}...` : value);

class Issues {
  readonly list: ImportIssue[] = [];
  /** Every problem seen, including those past the cap. */
  count = 0;
  add(path: string, message: string) {
    this.count++;
    if (this.list.length < MAX_ERRORS) this.list.push({ path, message });
    else if (this.count === MAX_ERRORS + 1)
      this.list.push({
        path: "",
        message: "Too many problems; the rest are omitted",
      });
  }
  get any() {
    return this.count > 0;
  }
}

/** A non-empty trimmed string of at most MAX_STRING characters, else undefined. */
function text(value: unknown, path: string, issues: Issues) {
  if (typeof value !== "string" || value.trim() === "") {
    issues.add(path, "must be a non-empty string");
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_STRING) {
    issues.add(path, `must be at most ${MAX_STRING} characters`);
    return undefined;
  }
  return trimmed;
}

/** Strips any directory part and caps the length; null when nothing is left. */
export function cleanFilename(name: string | null | undefined) {
  const base = (name ?? "").split(/[\\/]/).pop()!.trim();
  return base ? base.slice(0, MAX_FILENAME) : null;
}

function validateRows(value: unknown, issues: Issues): Row[] {
  if (!Array.isArray(value)) {
    issues.add("player_game_scores", "must be an array");
    return [];
  }
  if (value.length === 0) {
    issues.add("player_game_scores", "must not be empty");
    return [];
  }
  if (value.length > MAX_ROWS) {
    issues.add("player_game_scores", `must have at most ${MAX_ROWS} rows`);
    return [];
  }
  const rows: Row[] = [];
  const names = new Map<number, string>();
  const ids = new Map<string, number>();
  const seen = new Set<string>();
  value.forEach((raw: unknown, i) => {
    const path = `player_game_scores[${i}]`;
    if (!isObject(raw)) return issues.add(path, "must be an object");
    const before = issues.count;
    if (!isPositiveInt(raw.bgg_id))
      issues.add(`${path}.bgg_id`, "must be a positive integer");
    const game = text(raw.game, `${path}.game`, issues);
    const player = text(raw.player, `${path}.player`, issues);
    if (!isInt(raw.score)) issues.add(`${path}.score`, "must be an integer");
    if (!isInt(raw.rank)) issues.add(`${path}.rank`, "must be an integer");
    if (issues.count > before) return;
    const row: Row = {
      bggId: raw.bgg_id as number,
      game: game!,
      player: player!,
      score: raw.score as number,
      rank: raw.rank as number,
    };

    const named = names.get(row.bggId);
    if (named !== undefined && named !== row.game)
      return issues.add(
        `${path}.game`,
        `bgg_id ${row.bggId} is named both ${show(named)} and ${show(row.game)}`,
      );
    // selectedGames is keyed by game name, so a name must map to one id.
    const owner = ids.get(row.game);
    if (owner !== undefined && owner !== row.bggId)
      return issues.add(
        `${path}.game`,
        `${show(row.game)} is used by bgg_id ${owner} and ${row.bggId}`,
      );
    const key = `${row.bggId}|${row.player.toLowerCase()}`;
    if (seen.has(key))
      return issues.add(path, "duplicate score for this game and player");

    names.set(row.bggId, row.game);
    ids.set(row.game, row.bggId);
    seen.add(key);
    rows.push(row);
  });
  return rows;
}

type ImageResult = { url: string | null } | { error: string };

function parseImage(value: unknown): ImageResult {
  if (typeof value !== "string") return { error: "must be a string" };
  // Stored as-is: the metadata upsert keeps a "custom" image and its ext.
  if (value === CUSTOM_IMAGE) return { url: CUSTOM_IMAGE };
  if (value.length > MAX_IMAGE)
    return { error: `must be at most ${MAX_IMAGE} characters` };
  // new URL() trims whitespace, so check for it explicitly.
  if (value !== value.trim())
    return { error: "must not have surrounding spaces" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: "must be an https URL" };
  }
  return url.protocol === "https:"
    ? { url: value }
    : { error: "must be an https URL" };
}

type Meta = Omit<NormalizedGame, "bggId" | "name">;

function validateMeta(raw: unknown, path: string, issues: Issues) {
  if (!isObject(raw)) return void issues.add(path, "must be an object");
  const meta: Meta = {
    minPlayers: null,
    maxPlayers: null,
    imageUrl: null,
    imageExt: null,
  };
  const { players, image, ext } = raw;
  if (players !== undefined) {
    if (!isObject(players) || !isCount(players.min) || !isCount(players.max))
      issues.add(
        `${path}.players`,
        "min and max must be non-negative integers",
      );
    else if (players.min > players.max)
      issues.add(`${path}.players`, "min must not exceed max");
    else {
      meta.minPlayers = players.min;
      meta.maxPlayers = players.max;
    }
  }
  if (image !== undefined) {
    const parsed = parseImage(image);
    if ("error" in parsed) issues.add(`${path}.image`, parsed.error);
    else meta.imageUrl = parsed.url;
  }
  if (ext !== undefined) {
    if (typeof ext === "string" && EXTENSIONS.has(ext)) meta.imageExt = ext;
    else
      issues.add(`${path}.ext`, `must be one of ${[...EXTENSIONS].join(", ")}`);
  }
  return meta;
}

function validateGames(value: unknown, issues: Issues) {
  const games = new Map<number, Meta>();
  if (!isObject(value)) {
    issues.add("games", "must be an object keyed by bgg_id");
    return games;
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_ROWS) {
    issues.add("games", `must have at most ${MAX_ROWS} entries`);
    return games;
  }
  for (const [key, raw] of entries) {
    const path = `games[${show(key)}]`;
    // Only canonical positive-integer keys: rejects __proto__, constructor, "01", "1e3".
    if (!/^[1-9]\d{0,9}$/.test(key) || Number(key) > INT_MAX) {
      issues.add(path, "key must be a positive integer bgg_id");
      continue;
    }
    const meta = validateMeta(raw, path, issues);
    if (meta) games.set(Number(key), meta);
  }
  return games;
}

/** Merges rows and metadata into the shape the database layer writes. */
function normalize(
  year: number | null,
  rows: Row[],
  meta: Map<number, Meta>,
): NormalizedImport {
  const warnings: string[] = [];

  const spelling = new Map<string, string>();
  for (const { player } of rows) {
    const lower = player.toLowerCase();
    const first = spelling.get(lower);
    if (first === undefined) spelling.set(lower, player);
    else if (first !== player) {
      const note = `Players ${show(first)} and ${show(player)} are treated as one player`;
      if (!warnings.includes(note)) warnings.push(note);
    }
  }

  const games = new Map<number, NormalizedGame>();
  const empty: Meta = {
    minPlayers: null,
    maxPlayers: null,
    imageUrl: null,
    imageExt: null,
  };
  for (const [bggId, m] of meta) games.set(bggId, { bggId, name: null, ...m });
  for (const { bggId, game } of rows) {
    const existing = games.get(bggId) ?? { bggId, name: null, ...empty };
    games.set(bggId, { ...existing, name: game });
  }

  return {
    year,
    games: [...games.values()].sort((a, b) => a.bggId - b.bggId),
    players: [...spelling.values()],
    scores: rows.map(({ bggId, player, score, rank }) => ({
      bggId,
      player: spelling.get(player.toLowerCase())!,
      score,
      rank,
    })),
    warnings,
  };
}

/** Validates an uploaded JSON value, collecting every problem (capped). */
export function parseImport(raw: unknown): ParseResult {
  const issues = new Issues();
  if (!isObject(raw)) {
    issues.add("", "upload must be a JSON object");
    return { ok: false, errors: issues.list };
  }

  const isYear =
    Object.hasOwn(raw, "year") || Object.hasOwn(raw, "player_game_scores");
  if (isYear) {
    const year = raw.year;
    if (
      !Object.hasOwn(raw, "year") ||
      !isInt(year) ||
      year < 2000 ||
      year > 2100
    )
      issues.add("year", "must be an integer from 2000 to 2100");
    const rows = validateRows(raw.player_game_scores, issues);
    const games = Object.hasOwn(raw, "games")
      ? validateGames(raw.games, issues)
      : new Map<number, Meta>();
    return issues.any
      ? { ok: false, errors: issues.list }
      : { ok: true, value: normalize(year as number, rows, games) };
  }

  // Games-only: `{ games: {...} }` or the bare games.json map.
  const games = validateGames(
    Object.hasOwn(raw, "games") ? raw.games : raw,
    issues,
  );
  if (!issues.any && games.size === 0)
    issues.add("games", "must contain at least one game");
  return issues.any
    ? { ok: false, errors: issues.list }
    : { ok: true, value: normalize(null, [], games) };
}
