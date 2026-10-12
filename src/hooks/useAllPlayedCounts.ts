import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { toPlayedMap, type PlayedMap } from "@/lib/played";
import type { AllPlayedCountsResponse } from "@/types";

type AllPlayed = Record<string, PlayedMap>;

const EMPTY: AllPlayed = {};

// Every member's played games for a year (discord id, then bgg id), fetched
// once per year. Read-only: an empty year ("") skips the request, and a failure
// leaves the map empty so nothing is hidden.
const useAllPlayedCounts = (
  year: string,
  fetchImpl: typeof fetch = fetch,
): AllPlayed => {
  const [loaded, setLoaded] = useState<{ year: string; played: AllPlayed }>({
    year: "",
    played: EMPTY,
  });

  useEffect(() => {
    if (year === "") return;
    let cancelled = false;
    apiFetch<AllPlayedCountsResponse>(`/played?year=${year}`, {}, fetchImpl)
      .then(({ played }) => {
        if (cancelled) return;
        setLoaded({
          year,
          played: Object.fromEntries(
            Object.entries(played ?? {}).map(([id, games]) => [
              id,
              toPlayedMap(games),
            ]),
          ),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [year, fetchImpl]);

  return loaded.year === year ? loaded.played : EMPTY;
};

export default useAllPlayedCounts;
