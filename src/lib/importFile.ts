import type { ImportProblem } from "@/types";

// Pure helpers for the admin import page: read an uploaded file, build the
// request body for POST /api/admin/import and describe it for the preview.
// Deep validation stays on the server; this only catches what the page needs
// to pick the right upload shape.

type Obj = Record<string, unknown>;

export type Prepared =
  | { ok: true; body: Obj; summary: string; year: number | null }
  | { ok: false; error: string };

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const parseFile = (
  text: string,
): { ok: true; raw: Obj } | { ok: false; error: string } => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (!isObj(raw)) {
    return { ok: false, error: "The file must contain a JSON object." };
  }
  return { ok: true, raw };
};

// The year already named in the file, to prefill the year field.
export const fileYear = (raw: Obj): string =>
  typeof raw.year === "number" || typeof raw.year === "string"
    ? `${raw.year}`
    : "";

const distinct = (rows: unknown[], key: string): number =>
  new Set(rows.map((r) => (isObj(r) ? r[key] : undefined))).size;

// A bare games.json is a map of numeric BGG ids; wrap it as a games-only upload.
const isBareGames = (raw: Obj): boolean => {
  const ids = Object.keys(raw);
  return ids.length > 0 && ids.every((id) => /^\d+$/.test(id));
};

export const prepareImport = (raw: Obj, yearInput: string): Prepared => {
  const yearText = yearInput.trim();
  if (yearText !== "" && !/^\d{4}$/.test(yearText)) {
    return { ok: false, error: "Year must be a four-digit number." };
  }
  const year = yearText === "" ? null : Number(yearText);

  const hasScores = "player_game_scores" in raw;
  const hasGames = "games" in raw;
  const bare = !hasScores && !hasGames && isBareGames(raw);
  if (!hasScores && !hasGames && !bare) {
    return {
      ok: false,
      error: "Unrecognised file: expected player_game_scores or a games map.",
    };
  }

  if (hasScores) {
    const rows = raw.player_game_scores;
    if (!Array.isArray(rows)) {
      return { ok: false, error: "player_game_scores must be a list." };
    }
    if (year === null) {
      return { ok: false, error: "Enter a year for this scores file." };
    }
    const body: Obj = { year, player_game_scores: rows };
    let summary = `${rows.length} score rows, ${distinct(rows, "bgg_id")} games, ${distinct(rows, "player")} players`;
    if (isObj(raw.games)) {
      body.games = raw.games;
      summary += `, details for ${Object.keys(raw.games).length} games`;
    }
    return { ok: true, body, summary, year };
  }

  if (year !== null) {
    return {
      ok: false,
      error: "This file has no scores. Clear the year to import games only.",
    };
  }
  const games = bare ? raw : raw.games;
  if (!isObj(games) || Object.keys(games).length === 0) {
    return { ok: false, error: "The games map is empty." };
  }
  return {
    ok: true,
    body: { games },
    summary: `${Object.keys(games).length} games, no year`,
    year: null,
  };
};

// Server-side 422 bodies carry {errors:[{path,message}]}.
export const problemsFrom = (body: unknown): ImportProblem[] => {
  const errors = isObj(body) ? body.errors : undefined;
  if (!Array.isArray(errors)) return [];
  return errors.filter(isObj).map((e) => ({
    path: String(e.path ?? ""),
    message: String(e.message ?? ""),
  }));
};
