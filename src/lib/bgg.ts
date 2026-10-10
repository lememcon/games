import { ApiError } from "@/lib/api";
import { ADMIN_LOST, GENERIC_ERROR, isAuthError } from "@/lib/apiErrors";
import type { BggGameRow, BggJob } from "@/types";

// Maps an API failure to a message for the admin. Server messages are never
// shown verbatim: only the status and a short error code are used.
export const describeBggError = (e: unknown): string => {
  if (!(e instanceof ApiError)) return GENERIC_ERROR;
  if (isAuthError(e)) return ADMIN_LOST;
  if (e.status === 429) return "Wait a few seconds before testing again.";
  if (e.status === 409 && e.message === "key_not_set")
    return "Set and verify an API key to enable downloads.";
  if (e.status === 409 && e.message === "job_running")
    return "A download or key test is already running. Try again when it finishes.";
  if (e.status === 400 && e.message === "invalid_key")
    return "That key isn't valid: use 1 to 200 characters with no line breaks.";
  if (e.status === 400) return "The request was rejected.";
  if (e.status === 502)
    return "The score data couldn't be loaded. Try again shortly.";
  return GENERIC_ERROR;
};

export const isRunning = (job: BggJob | undefined): boolean =>
  job?.state === "running";

// Games that still need a download: nothing stored yet, or stored but incomplete.
export const incompleteIds = (games: BggGameRow[]): number[] =>
  games.filter((g) => g.state !== "loaded").map((g) => g.bggId);

// Case-insensitive match on the name or BGG id.
export const filterGames = (
  games: BggGameRow[],
  query: string,
): BggGameRow[] => {
  const q = query.trim().toLowerCase();
  return q
    ? games.filter(
        (g) => g.name.toLowerCase().includes(q) || String(g.bggId).includes(q),
      )
    : games;
};

export const toggleId = (selected: number[], id: number): number[] =>
  selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];

// Selects every id when any is unselected, otherwise clears them.
export const toggleAll = (selected: number[], ids: number[]): number[] =>
  ids.every((id) => selected.includes(id))
    ? selected.filter((s) => !ids.includes(s))
    : [...new Set([...selected, ...ids])];

export const progressPercent = (job: BggJob): number =>
  job.total === 0
    ? job.state === "idle"
      ? 0
      : 100
    : Math.min(100, Math.round((job.done / job.total) * 100));
