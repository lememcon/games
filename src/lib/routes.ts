// The scoreboard's URL scheme. This parser is the single source of truth for
// which scoreboard page a path means; Scoreboard renders whatever it returns.
//
//   /                  home (redirects to the default year)
//   /:year             a year's scoreboard
//   /:year/games/:id   a game's scores in that year
//   /games/:id         legacy game URL (redirects into the default year)

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
