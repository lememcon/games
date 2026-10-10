import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { AllPlayedCountsResponse } from "@/types";

type AllCounts = AllPlayedCountsResponse["counts"];

const EMPTY: AllCounts = {};

// Every member's play counts for a year (discord id, then bgg id), fetched once
// per year. Read-only: an empty year ("") skips the request, and a failure
// leaves the counts empty so nothing is hidden.
const useAllPlayedCounts = (
  year: string,
  fetchImpl: typeof fetch = fetch,
): AllCounts => {
  const [loaded, setLoaded] = useState<{ year: string; counts: AllCounts }>({
    year: "",
    counts: EMPTY,
  });

  useEffect(() => {
    if (year === "") return;
    let cancelled = false;
    apiFetch<AllPlayedCountsResponse>(`/played?year=${year}`, {}, fetchImpl)
      .then(({ counts }) => {
        if (!cancelled) setLoaded({ year, counts });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [year, fetchImpl]);

  return loaded.year === year ? loaded.counts : EMPTY;
};

export default useAllPlayedCounts;
