import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { GENERIC_ERROR } from "@/lib/apiErrors";
import { vetoesByMember } from "@/lib/games";
import { bulkFailureMessage } from "@/lib/selection";
import { vetoesApi } from "@/lib/vetoesApi";

const MESSAGES: Record<string, string> = {
  unknown_game: "That game no longer exists.",
};

const describe = (e: unknown): string =>
  (e instanceof ApiError && MESSAGES[e.message]) || GENERIC_ERROR;

type All = ReturnType<typeof vetoesByMember>;

const EMPTY: All = {};

// Every member's vetoes (discord id, then bgg id as a string), which apply to
// every year, plus veto and unveto for the signed-in member. A failed load
// leaves the vetoes empty so nothing is hidden. Mutations are not optimistic:
// the list is refetched after each one. Saving and errors are tracked per
// game, so one save locks only its own game and a failure shows on that game.
// A new action on a game clears that game's error; errors persist until then.
// Only the newest list response is applied, so a slow earlier fetch can never
// overwrite a fresher one.
const useVetoes = (fetchImpl: typeof fetch = fetch) => {
  const [all, setAll] = useState(EMPTY);
  const [saving, setSaving] = useState<ReadonlySet<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [bulkError, setBulkError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const mine = ++latest.current;
    vetoesApi(fetchImpl)
      .list()
      .then(
        (d) =>
          !cancelled &&
          mine === latest.current &&
          setAll(vetoesByMember(d.vetoes)),
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  const mutate = async (bggId: number, run: () => Promise<void>) => {
    setSaving((prev) => new Set(prev).add(bggId));
    setErrors(({ [bggId]: _dropped, ...rest }) => rest);
    let message: string | null = null;
    try {
      await run();
    } catch (e) {
      message = describe(e);
    }
    // Refetch either way so a stale view resyncs.
    const mine = ++latest.current;
    try {
      const d = await vetoesApi(fetchImpl).list();
      if (mine === latest.current) setAll(vetoesByMember(d.vetoes));
    } catch {
      if (mine === latest.current) message ??= GENERIC_ERROR;
    }
    setSaving((prev) => {
      const next = new Set(prev);
      next.delete(bggId);
      return next;
    });
    if (message) setErrors((prev) => ({ ...prev, [bggId]: message }));
  };

  // Vetoes many games with one refetch. Failures are reported together in
  // bulkError rather than per game; resolves with the ids that did not save.
  const vetoMany = async (bggIds: number[]): Promise<number[]> => {
    if (bggIds.length === 0) return [];
    const api = vetoesApi(fetchImpl);
    setSaving((prev) => new Set([...prev, ...bggIds]));
    setBulkError(null);
    const results = await Promise.allSettled(bggIds.map((id) => api.set(id)));
    const failed = bggIds.filter((_, i) => results[i].status === "rejected");
    let message: string | null = null;
    if (failed.length === bggIds.length) {
      const first = results.find((r) => r.status === "rejected");
      message = describe(first?.reason);
    } else if (failed.length > 0) {
      message = bulkFailureMessage(failed.length, bggIds.length);
    }
    const mine = ++latest.current;
    try {
      const d = await api.list();
      if (mine === latest.current) setAll(vetoesByMember(d.vetoes));
    } catch {
      if (mine === latest.current) message ??= GENERIC_ERROR;
    }
    setSaving((prev) => {
      const next = new Set(prev);
      bggIds.forEach((id) => next.delete(id));
      return next;
    });
    setBulkError(message);
    return failed;
  };

  return {
    all,
    saving,
    bulkError,
    vetoMany,
    clearBulkError: () => setBulkError(null),
    error: errors,
    isSaving: (bggId: number) => saving.has(bggId),
    errorFor: (bggId: number): string | null => errors[bggId] ?? null,
    veto: (bggId: number) =>
      mutate(bggId, () => vetoesApi(fetchImpl).set(bggId)),
    unveto: (bggId: number) =>
      mutate(bggId, () => vetoesApi(fetchImpl).clear(bggId)),
  };
};

export type VetoesState = ReturnType<typeof useVetoes>;

export default useVetoes;
