import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { GENERIC_ERROR } from "@/lib/apiErrors";
import { vetoesByMember } from "@/lib/games";
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
// the list is refetched after each one.
const useVetoes = (fetchImpl: typeof fetch = fetch) => {
  const [all, setAll] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    vetoesApi(fetchImpl)
      .list()
      .then((d) => !cancelled && setAll(vetoesByMember(d.vetoes)))
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
        setAll(vetoesByMember((await vetoesApi(fetchImpl).list()).vetoes));
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
    veto: (bggId: number) => mutate(() => vetoesApi(fetchImpl).set(bggId)),
    unveto: (bggId: number) => mutate(() => vetoesApi(fetchImpl).clear(bggId)),
  };
};

export type VetoesState = ReturnType<typeof useVetoes>;

export default useVetoes;
