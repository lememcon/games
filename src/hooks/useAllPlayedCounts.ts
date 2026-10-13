import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { toPlayedMaps, type PlayedMap } from "@/lib/played";
import type { AllPlayedCountsResponse, MarkPlayedResponse } from "@/types";

type AllPlayed = Record<string, PlayedMap>;

const EMPTY: AllPlayed = {};

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

  // The current year, and whether a POST response already set it (so a GET
  // still in flight must not overwrite that newer result).
  const yearRef = useRef(year);
  const marked = useRef(false);

  useEffect(() => {
    yearRef.current = year;
    marked.current = false;
    if (year === "") return;
    let cancelled = false;
    apiFetch<AllPlayedCountsResponse>(`/played?year=${year}`, {}, fetchImpl)
      .then(({ played }) => {
        if (cancelled || marked.current) return;
        setLoaded({ year, played: toPlayedMaps(played) });
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
      if (yearRef.current !== year) return;
      marked.current = true;
      setLoaded({ year, played: toPlayedMaps(played) });
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
