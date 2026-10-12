// Played is a yes/no flag per game; the app keeps it as a bgg id -> 1 map.
export type PlayedMap = Record<string, 1>;

/** The map for a list of played bgg ids; a missing list is empty. */
export const toPlayedMap = (ids: string[] | undefined): PlayedMap =>
  Object.fromEntries((ids ?? []).map((id) => [id, 1 as const]));
