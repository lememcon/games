import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { toPlayedMap, type PlayedMap } from "@/lib/played";
import type { AllPlayedCountsResponse, MarkPlayedResponse } from "@/types";

type AllPlayed = Record<string, PlayedMap>;

const EMPTY: AllPlayed = {};

const toMaps = (played: Record<string, string[]> | undefined): AllPlayed =>
  Object.fromEntries(
    Object.entries(played ?? {}).map(([id, games]) => [id, toPlayedMap(games)]),
  );

// Every member's played games for a year (discord id, then bgg id), fetched
// once per year. Read-only: an empty year ("") skips the request, and a failure
// leaves the map empty so nothing is hidden.
const useAllPlayed = (
  year: string,
  fetchImpl: typeof fetch = fetch,
): [AllPlayed, (bggId: string, discordIds: string[]) => Promise<void>] => {
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
        setLoaded({ year, played: toMaps(played) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [year, fetchImpl]);

  // Not optimistic: the response replaces the loaded year, and a failure is
  // rethrown for the caller to show.
  const markPlayed = useCallback(
    async (bggId: string, discordIds: string[]) => {
      const { played } = await apiFetch<MarkPlayedResponse>(
        `/played/${year}/${bggId}`,
        { method: "POST", body: { discordIds } },
        fetchImpl,
      );
      setLoaded((prev) =>
        prev.year === year ? { year, played: toMaps(played) } : prev,
      );
    },
    [year, fetchImpl],
  );

  return [loaded.year === year ? loaded.played : EMPTY, markPlayed];
};

const useAllPlayedCounts = (year: string, fetchImpl?: typeof fetch) =>
  useAllPlayed(year, fetchImpl)[0];

// Like useAllPlayedCounts, plus `markPlayed(bggId, discordIds)` to set a game
// played for several members at once.
export const useMarkPlayedCounts = useAllPlayed;

export default useAllPlayedCounts;
