import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { GENERIC_ERROR } from "@/lib/apiErrors";
import { vetoesByMember } from "@/lib/games";
import { vetoesApi } from "@/lib/vetoesApi";

const MESSAGES: Record<string, string> = {
  unknown_year: "That year no longer exists.",
  unknown_game: "That game no longer exists.",
};

const describe = (e: unknown): string =>
  (e instanceof ApiError && MESSAGES[e.message]) || GENERIC_ERROR;

type All = ReturnType<typeof vetoesByMember>;

const EMPTY: All = {};

// Every member's vetoes for a year (discord id, then bgg id as a string), plus
// veto and unveto for the signed-in member. An empty year ("") skips the
// request and a failed load leaves the vetoes empty so nothing is hidden.
// Mutations are not optimistic: the list is refetched after each one. Results
// that belong to another year than the one now viewed are ignored.
const useVetoes = (year: string, fetchImpl: typeof fetch = fetch) => {
  const [loaded, setLoaded] = useState<{ year: string; all: All }>({
    year: "",
    all: EMPTY,
  });
  const [status, setStatus] = useState<{
    year: string;
    saving: boolean;
    error: string | null;
  }>({ year: "", saving: false, error: null });

  const yearRef = useRef(year);
  useEffect(() => {
    yearRef.current = year;
  }, [year]);

  useEffect(() => {
    if (year === "") return;
    let cancelled = false;
    vetoesApi(fetchImpl)
      .listYear(year)
      .then(
        (d) => !cancelled && setLoaded({ year, all: vetoesByMember(d.vetoes) }),
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [year, fetchImpl]);

  const mutate = useCallback(
    async (run: () => Promise<void>) => {
      setStatus({ year, saving: true, error: null });
      let error: string | null = null;
      try {
        await run();
      } catch (e) {
        error = describe(e);
      }
      // Refetch either way so a stale view resyncs.
      try {
        const d = await vetoesApi(fetchImpl).listYear(year);
        if (yearRef.current === year)
          setLoaded({ year, all: vetoesByMember(d.vetoes) });
      } catch {
        error ??= GENERIC_ERROR;
      }
      setStatus({ year, saving: false, error });
    },
    [year, fetchImpl],
  );

  const current = status.year === year;
  return {
    all: loaded.year === year ? loaded.all : EMPTY,
    saving: current && status.saving,
    error: current ? status.error : null,
    veto: (bggId: number) =>
      mutate(() => vetoesApi(fetchImpl).set(year, bggId)),
    unveto: (bggId: number) =>
      mutate(() => vetoesApi(fetchImpl).clear(year, bggId)),
  };
};

export type VetoesState = ReturnType<typeof useVetoes>;

export default useVetoes;
