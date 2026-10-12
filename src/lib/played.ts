import { gameOptions } from "@/lib/games";
import type { PlayerGameScore } from "@/types";

// Played is a yes/no flag per game; the app keeps it as a bgg id -> 1 map.
export type PlayedMap = Record<string, 1>;

/** The map for a list of played bgg ids; a missing list is empty. */
export const toPlayedMap = (ids: string[] | undefined): PlayedMap =>
  Object.fromEntries((ids ?? []).map((id) => [id, 1 as const]));

/** Game names by string bgg id, from a year's score rows. */
export const gameNamesById = (
  scores: PlayerGameScore[],
): Record<string, string> =>
  Object.fromEntries(scores.map((s) => [String(s.bgg_id), s.game]));

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** The played games, by name; a game without a known name is `Game <id>`. */
export const playedGames = (
  counts: PlayedMap,
  names: Record<string, string>,
): { id: string; name: string }[] =>
  Object.keys(counts)
    .map((id) => ({ id, name: names[id] ?? `Game ${id}` }))
    .sort(byName);

/** Select options for the named games not yet played, sorted by name. */
export const addOptions = (
  names: Record<string, string>,
  counts: PlayedMap,
): { value: string; label: string }[] =>
  gameOptions(
    Object.fromEntries(
      Object.entries(names).map(([id, name]) => [id, { name }]),
    ),
    Object.keys(counts),
  );

/** The year to show first: this year if listed, else the latest, else none. */
export const defaultYear = (years: string[], now: Date): string => {
  const current = String(now.getFullYear());
  return years.includes(current) ? current : (years[years.length - 1] ?? "");
};
