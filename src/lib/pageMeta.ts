import { gamePath, playerPath, recapPath, yearPath } from "@/lib/routes";

export const SITE_ORIGIN = "https://games.lememcon.com";
export const SITE_NAME = "Lememcon Games";
// Fallbacks only; the same text is in index.html for crawlers and first paint.
export const DEFAULT_DESCRIPTION =
  "Rank and filter LememCon board-game scores by player, game and year.";

// path is the page's canonical path (no origin), or null for a page that
// should not claim a canonical URL.
export interface PageMeta {
  title: string;
  description: string;
  path: string | null;
}

interface PageMetaInput {
  title?: string;
  description?: string;
  path?: string | null;
}

const normalizePath = (path: string): string => {
  const bare = path.split(/[?#]/)[0].replace(/\/+$/, "");
  return bare === "" ? "/" : bare.startsWith("/") ? bare : `/${bare}`;
};

export const pageMeta = ({
  title,
  description,
  path,
}: PageMetaInput = {}): PageMeta => ({
  title: title ? `${title} | ${SITE_NAME}` : SITE_NAME,
  description: description ?? DEFAULT_DESCRIPTION,
  path: path == null ? null : normalizePath(path),
});

export const yearMeta = (year: string | number): PageMeta =>
  pageMeta({
    title: `${year} scores`,
    description: `Board game scores and rankings for LememCon ${year}.`,
    path: yearPath(year),
  });

export const gameMeta = (
  year: string | number,
  id: string | number,
  name: string,
): PageMeta =>
  pageMeta({
    title: `${name}, ${year} scores`,
    description: `${name} scores and rankings for LememCon ${year}.`,
    path: gamePath(year, id),
  });

export const playerMeta = (name: string, discordId: string): PageMeta =>
  pageMeta({
    title: name,
    description: `${name}'s LememCon profile.`,
    path: playerPath(discordId),
  });

export const recapMeta = (
  name: string,
  discordId: string,
  year: string | number,
): PageMeta =>
  pageMeta({
    title: `${name}'s ${year} in review`,
    description: `${name}'s LememCon ${year} in review.`,
    path: recapPath(discordId, year),
  });

interface ScoreboardState {
  // The year in the URL, whether or not it has scores.
  routeYear: string | null;
  gameId: string | undefined;
  yearKnown: boolean;
  yearsLoading: boolean;
  // The year's scores and game details have loaded.
  loaded: boolean;
  gameName: string | undefined;
}

// The scoreboard's metadata. Only a year route that is, or may yet turn out to
// be, a real year claims a title and canonical; home, redirects and unknown
// years keep the default.
export const scoreboardMeta = ({
  routeYear,
  gameId,
  yearKnown,
  yearsLoading,
  loaded,
  gameName,
}: ScoreboardState): PageMeta => {
  if (routeYear === null || (!yearKnown && !yearsLoading)) return pageMeta();
  if (gameId === undefined || !loaded) return yearMeta(routeYear);
  if (gameName !== undefined) return gameMeta(routeYear, gameId, gameName);
  return { ...yearMeta(routeYear), path: gamePath(routeYear, gameId) };
};
