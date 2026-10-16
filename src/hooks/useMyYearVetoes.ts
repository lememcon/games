import { useCallback, useEffect, useRef, useState } from "react";

import { GENERIC_ERROR } from "@/lib/apiErrors";
import { vetoesApi } from "@/lib/vetoesApi";
import type { MyYearVeto } from "@/types";

// The signed-in member's single-year vetoes, with undo. Not optimistic: the
// list is refetched after each change.
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

  // A second call while one runs is ignored.
  const clear = useCallback(
    async (year: number, bggId: number) => {
      if (busy.current) return;
      busy.current = true;
      setSaving(true);
      setError(null);
      try {
        await vetoesApi(fetchImpl).clearYear(String(year), bggId);
        setVetoes((await vetoesApi(fetchImpl).listMineYear()).vetoes);
      } catch {
        setError(GENERIC_ERROR);
      }
      busy.current = false;
      setSaving(false);
    },
    [fetchImpl],
  );

  return { vetoes, loading, saving, error, clear };
};

export default useMyYearVetoes;
