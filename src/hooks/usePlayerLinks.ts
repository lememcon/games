import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { groupByMember } from "@/lib/playerLinks";
import type { PlayerLinks } from "@/types";

const GENERIC = "Something went wrong. Try again.";

const describe = (e: unknown): string => {
  if (!(e instanceof ApiError)) return GENERIC;
  if (e.status === 401 || e.status === 403)
    return "You no longer have admin access.";
  if (e.message === "unknown_player") return "That player no longer exists.";
  if (e.message === "unknown_user") return "That member no longer exists.";
  if (e.message === "name_taken")
    return "That name matches another member's display name.";
  if (e.status === 400) return `The change was rejected: ${e.message}`;
  return GENERIC;
};

// Player/member links plus link and unlink. Mutations are not optimistic: the
// list is refetched after each one, so the page always shows server state.
const usePlayerLinks = (fetchImpl: typeof fetch = fetch) => {
  const [data, setData] = useState<PlayerLinks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PlayerLinks>("/admin/player-links", {}, fetchImpl)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  const setLink = useCallback(
    async (playerId: number, discordId: string | null) => {
      setActionError(null);
      try {
        await apiFetch<void>(
          `/admin/players/${playerId}`,
          { method: "PATCH", body: { discordId } },
          fetchImpl,
        );
      } catch (e) {
        setActionError(describe(e));
      }
      // Refetch either way so a stale row (e.g. a deleted member) resyncs.
      try {
        setData(
          await apiFetch<PlayerLinks>("/admin/player-links", {}, fetchImpl),
        );
      } catch {
        setActionError((prev) => prev ?? GENERIC);
      }
    },
    [fetchImpl],
  );

  const players = data?.players;
  const users = data?.users;
  const grouped = useMemo(
    () => groupByMember(players ?? [], users ?? []),
    [players, users],
  );

  return {
    players: players ?? [],
    users: users ?? [],
    members: grouped.members,
    unlinked: grouped.unlinked,
    loading,
    error,
    actionError,
    link: (playerId: number, discordId: string) => setLink(playerId, discordId),
    unlink: (playerId: number) => setLink(playerId, null),
  };
};

export default usePlayerLinks;
