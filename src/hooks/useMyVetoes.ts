import { useCallback, useEffect, useState } from "react";

import { GENERIC_ERROR } from "@/lib/apiErrors";
import { vetoesApi } from "@/lib/vetoesApi";
import type { MyVeto } from "@/types";

// The signed-in member's vetoes across all years, with undo. Not optimistic:
// the list is refetched after each clear.
const useMyVetoes = (fetchImpl: typeof fetch = fetch) => {
  const [vetoes, setVetoes] = useState<MyVeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const clear = useCallback(
    async (year: number, bggId: number) => {
      setError(null);
      try {
        await vetoesApi(fetchImpl).clear(year, bggId);
        setVetoes((await vetoesApi(fetchImpl).listMine()).vetoes);
      } catch {
        setError(GENERIC_ERROR);
      }
    },
    [fetchImpl],
  );

  return { vetoes, loading, error, clear };
};

export type MyVetoesState = ReturnType<typeof useMyVetoes>;

export default useMyVetoes;
