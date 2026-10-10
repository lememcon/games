import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { GENERIC_ERROR } from "@/lib/apiErrors";
import { rangesByMember } from "@/lib/games";
import { playerOverridesApi } from "@/lib/playerOverridesApi";
import type { Bounds } from "@/types";

const MESSAGES: Record<string, string> = {
  not_linked:
    "Your account isn't linked to a player on the score sheet yet. Ask an admin to link it.",
  out_of_range: "That range is wider than this game allows.",
  unknown_game: "That game no longer exists.",
  no_player_range: "This game has no known player count to narrow.",
};

const describe = (e: unknown): string =>
  (e instanceof ApiError && MESSAGES[e.message]) || GENERIC_ERROR;

const EMPTY: Record<string, Record<string, Bounds>> = {};

// Every member's own player count ranges (discord id, then bgg id), plus save
// and reset for the signed-in member. A failed load leaves the ranges empty so
// nothing is hidden. Mutations are not optimistic: the list is refetched after
// each one.
const usePlayerOverrides = (fetchImpl: typeof fetch = fetch) => {
  const [all, setAll] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    playerOverridesApi(fetchImpl)
      .list()
      .then((d) => !cancelled && setAll(rangesByMember(d.overrides)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  const mutate = useCallback(
    async (run: () => Promise<void>) => {
      setSaving(true);
      setError(null);
      try {
        await run();
      } catch (e) {
        setError(describe(e));
      }
      // Refetch either way so a stale view resyncs.
      try {
        setAll(
          rangesByMember(
            (await playerOverridesApi(fetchImpl).list()).overrides,
          ),
        );
      } catch {
        setError((prev) => prev ?? GENERIC_ERROR);
      }
      setSaving(false);
    },
    [fetchImpl],
  );

  return {
    all,
    saving,
    error,
    save: (bggId: number, range: Bounds) =>
      mutate(() => playerOverridesApi(fetchImpl).set(bggId, range)),
    reset: (bggId: number) =>
      mutate(() => playerOverridesApi(fetchImpl).clear(bggId)),
  };
};

export type PlayerOverridesState = ReturnType<typeof usePlayerOverrides>;

export default usePlayerOverrides;
