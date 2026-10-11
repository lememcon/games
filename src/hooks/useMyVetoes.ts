import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { GENERIC_ERROR } from "@/lib/apiErrors";
import { vetoesApi } from "@/lib/vetoesApi";
import type { MyVeto } from "@/types";

const MESSAGES: Record<string, string> = {
  unknown_game: "That game no longer exists.",
};

const describe = (e: unknown): string =>
  (e instanceof ApiError && MESSAGES[e.message]) || GENERIC_ERROR;

// The signed-in member's vetoes, which apply to every year, with add and undo. Not
// optimistic: the list is refetched after each change.
const useMyVetoes = (fetchImpl: typeof fetch = fetch) => {
  const [vetoes, setVetoes] = useState<MyVeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    vetoesApi(fetchImpl)
      .listMine()
      .then((d) => !cancelled && setVetoes(d.vetoes))
      .catch(() => !cancelled && setError(GENERIC_ERROR))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  // Runs one mutation then refetches; a second call while one runs is ignored.
  const mutate = useCallback(
    async (run: () => Promise<void>) => {
      if (busy.current) return;
      busy.current = true;
      setSaving(true);
      setError(null);
      try {
        await run();
        setVetoes((await vetoesApi(fetchImpl).listMine()).vetoes);
      } catch (e) {
        setError(describe(e));
      }
      busy.current = false;
      setSaving(false);
    },
    [fetchImpl],
  );

  const add = (bggId: number) => mutate(() => vetoesApi(fetchImpl).set(bggId));
  const clear = (bggId: number) =>
    mutate(() => vetoesApi(fetchImpl).clear(bggId));

  return { vetoes, loading, saving, error, add, clear };
};

export type MyVetoesState = ReturnType<typeof useMyVetoes>;

export default useMyVetoes;
