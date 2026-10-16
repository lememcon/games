import { useMemo } from "react";

import { useVetoSet } from "@/hooks/useVetoes";
import { vetoesApi } from "@/lib/vetoesApi";

// Every member's vetoes for one year only, plus veto and unveto for the
// signed-in member. A null year loads nothing. Changing the year drops the
// previous year's vetoes, saves and errors, and ignores any save still in
// flight for it. See useVetoSet.
const useYearVetoes = (year: string | null, fetchImpl: typeof fetch = fetch) =>
  useVetoSet(
    useMemo(() => {
      if (year === null) return null;
      const api = vetoesApi(fetchImpl);
      return {
        list: () => api.listYear(year),
        set: (bggId: number) => api.setYear(year, bggId),
        clear: (bggId: number) => api.clearYear(year, bggId),
      };
    }, [year, fetchImpl]),
    `${year}`,
    { resetOnKeyChange: true },
  );

export type YearVetoesState = ReturnType<typeof useYearVetoes>;

export default useYearVetoes;
