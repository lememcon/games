import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { GENERIC_ERROR } from "@/lib/apiErrors";
import { vetoesApi } from "@/lib/vetoesApi";
import type { MyYearVeto } from "@/types";

const MESSAGES: Record<string, string> = {
  unknown_game: "That game no longer exists.",
  unknown_year: "That year has no data.",
};

const describe = (e: unknown): string =>
  (e instanceof ApiError && MESSAGES[e.message]) || GENERIC_ERROR;

// The signed-in member's single-year vetoes, with add and undo. Not optimistic:
// the list is refetched after each change.
const useMyYearVetoes = (fetchImpl: typeof fetch = fetch) => {
  const [vetoes, setVetoes] = useState<MyYearVeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    vetoesApi(fetchImpl)
      .listMineYear()
      .then((d) => !cancelled && setVetoes(d.vetoes))
      .catch(() => !cancelled && setError(GENERIC_ERROR))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  // Runs one mutation then refetches; a second call while one runs is ignored.
  // Resolves true only when the change and the refetch both succeeded.
  const mutate = useCallback(
    async (run: () => Promise<void>) => {
      if (busy.current) return false;
      busy.current = true;
      setSaving(true);
      setError(null);
      let ok = false;
      try {
        await run();
        setVetoes((await vetoesApi(fetchImpl).listMineYear()).vetoes);
        ok = true;
      } catch (e) {
        setError(describe(e));
      }
      busy.current = false;
      setSaving(false);
      return ok;
    },
    [fetchImpl],
  );

  const add = (year: number, bggId: number) =>
    mutate(() => vetoesApi(fetchImpl).setYear(String(year), bggId));
  const clear = (year: number, bggId: number) =>
    mutate(() => vetoesApi(fetchImpl).clearYear(String(year), bggId));

  return { vetoes, loading, saving, error, add, clear };
};

export default useMyYearVetoes;
