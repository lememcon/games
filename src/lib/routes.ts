// The scoreboard's URL scheme. This parser is the single source of truth for
// which scoreboard page a path means; Scoreboard renders whatever it returns.
//
//   /                  home (redirects to the default year)
//   /:year             a year's scoreboard
//   /:year/games/:id   a game's scores in that year
//   /games/:id         legacy game URL (redirects into the default year)
//
// A year's page may also carry its filters in the query, so a link can be
// shared: /:year?players=Alice,Bob&hidePlayed=1 (see buildFilterSearch).

export type ScoreboardRoute =
  | { kind: "home" }
  | { kind: "year"; year: string; gameId?: string }
  | { kind: "legacyGame"; id: string }
  | { kind: "unknown" };

export const isYear = (s: string): boolean => /^\d{4}$/.test(s);

export const yearPath = (year: string | number): string => `/${year}`;

export const gamePath = (year: string | number, id: string | number): string =>
  `/${year}/games/${id}`;

export const parseScoreboardPath = (pathname: string): ScoreboardRoute => {
  const parts = pathname.split("/").filter((part) => part !== "");
  const [first, second, third] = parts;

  if (parts.length === 0) return { kind: "home" };
  if (first === "games" && second !== undefined && parts.length === 2) {
    return { kind: "legacyGame", id: second };
  }
  if (!isYear(first)) return { kind: "unknown" };
  if (parts.length === 1) return { kind: "year", year: first };
  if (second === "games" && third !== undefined && parts.length === 3) {
    return { kind: "year", year: first, gameId: third };
  }
  return { kind: "unknown" };
};

export interface FilterState {
  players: string[];
  hidePlayed: boolean;
}

// The query string ("?players=...&hidePlayed=1", or "" when no filter is on).
// Names are encoded one by one and joined by literal commas, so a comma inside
// a name stays distinguishable from the separator.
export const buildFilterSearch = ({
  players,
  hidePlayed,
}: FilterState): string => {
  const parts: string[] = [];
  if (players.length > 0) {
    parts.push(`players=${players.map(encodeURIComponent).join(",")}`);
  }
  if (hidePlayed) parts.push("hidePlayed=1");
  return parts.length > 0 ? `?${parts.join("&")}` : "";
};

const decodePiece = (piece: string): string => {
  try {
    return decodeURIComponent(piece).trim();
  } catch {
    return "";
  }
};

// The inverse of buildFilterSearch. null when neither param is present, so the
// caller falls back to its saved filters. Splits by hand: URLSearchParams would
// decode the commas before they can be told apart from a separator.
export const parseFilterSearch = (search: string): FilterState | null => {
  let players: string[] | null = null;
  let hidePlayed: boolean | null = null;
  for (const pair of search.replace(/^\?/, "").split("&")) {
    const at = pair.indexOf("=");
    const key = at === -1 ? pair : pair.slice(0, at);
    const value = at === -1 ? "" : pair.slice(at + 1);
    if (key === "players") {
      players = [
        ...new Set(
          value
            .split(",")
            .map(decodePiece)
            .filter((n) => n !== ""),
        ),
      ];
    } else if (key === "hidePlayed") {
      hidePlayed = value === "1";
    }
  }
  if (players === null && hidePlayed === null) return null;
  return { players: players ?? [], hidePlayed: hidePlayed ?? false };
};

export const sharePath = (year: string | number, filters: FilterState) =>
  `${yearPath(year)}${buildFilterSearch(filters)}`;
