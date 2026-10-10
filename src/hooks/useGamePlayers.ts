import { useCallback, useEffect, useState } from "react";

import { gamePlayersApi } from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import { ADMIN_LOST, GENERIC_ERROR, isAuthError } from "@/lib/apiErrors";
import type { Bounds, GamePlayersRow } from "@/types";

const describe = (e: unknown): string => {
  if (!(e instanceof ApiError)) return GENERIC_ERROR;
  if (isAuthError(e)) return ADMIN_LOST;
  if (e.message === "unknown_game") return "That game no longer exists.";
  if (e.status === 400) return `The change was rejected: ${e.message}`;
  return GENERIC_ERROR;
};

// Games with BGG's player range and the admin override, plus save and reset.
// Mutations are not optimistic: the list is refetched after each one. Saving
// and errors are tracked per game so one row's failure does not hide the rest.
const useGamePlayers = (fetchImpl: typeof fetch = fetch) => {
  const [games, setGames] = useState<GamePlayersRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState<ReadonlySet<number>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    gamePlayersApi(fetchImpl)
      .list()
      .then((d) => !cancelled && setGames(d.games))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  const mutate = useCallback(
    async (bggId: number, run: () => Promise<void>) => {
      setSaving((prev) => new Set(prev).add(bggId));
      setRowErrors(({ [bggId]: _, ...rest }) => rest);
      const fail = (message: string) =>
        setRowErrors((prev) => ({ ...prev, [bggId]: prev[bggId] ?? message }));
      try {
        await run();
      } catch (e) {
        fail(describe(e));
      }
      // Refetch either way so a stale row resyncs.
      try {
        setGames((await gamePlayersApi(fetchImpl).list()).games);
      } catch {
        fail(GENERIC_ERROR);
      }
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(bggId);
        return next;
      });
    },
    [fetchImpl],
  );

  return {
    games,
    loading,
    error,
    saving,
    rowErrors,
    save: (bggId: number, range: Bounds) =>
      mutate(bggId, () => gamePlayersApi(fetchImpl).set(bggId, range)),
    reset: (bggId: number) =>
      mutate(bggId, () => gamePlayersApi(fetchImpl).clear(bggId)),
  };
};

export default useGamePlayers;
