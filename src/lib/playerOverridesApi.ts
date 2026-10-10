// Typed wrappers for the members' own player count range endpoints.
import { apiFetch } from "@/lib/api";
import type { Bounds, PlayerOverride } from "@/types";

export const playerOverridesApi = (fetchImpl: typeof fetch = fetch) => ({
  list: () =>
    apiFetch<{ overrides: PlayerOverride[] }>(
      "/player-overrides",
      {},
      fetchImpl,
    ),
  set: (bggId: number, range: Bounds) =>
    apiFetch<void>(
      `/me/player-overrides/${bggId}`,
      { method: "PUT", body: { min: range.min, max: range.max } },
      fetchImpl,
    ),
  clear: (bggId: number) =>
    apiFetch<void>(
      `/me/player-overrides/${bggId}`,
      { method: "DELETE" },
      fetchImpl,
    ),
});
