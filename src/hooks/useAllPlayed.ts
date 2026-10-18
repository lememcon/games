import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { announceChange } from "@/lib/changeSync";
import { toPlayedMaps, type PlayedMap } from "@/lib/played";
import type { AllPlayedResponse, MarkPlayedResponse } from "@/types";

type AllPlayed = Record<string, PlayedMap>;

const EMPTY: AllPlayed = {};

// Every member's played games for a year (discord id, then bgg id), fetched
// once per year, plus `markPlayed(bggId, discordIds)` to set a game played for
// several members at once. An empty year ("") skips the request, and a failure
// leaves the map empty so nothing is hidden. The third item is a message when
// the load failed unexpectedly (not signed in, not approved or an unknown year
// stay silent), for the current year only. The fourth is whether the load for
// this year has settled (succeeded or failed), so a page can wait for it.
export const useMarkPlayed = (
  year: string,
  fetchImpl: typeof fetch = fetch,
): [
  AllPlayed,
  (bggId: string, discordIds: string[]) => Promise<void>,
  string | null,
  boolean,
] => {
  const [loaded, setLoaded] = useState<{ year: string; played: AllPlayed }>({
    year: "",
    played: EMPTY,
  });

  // The year whose load has settled, one way or another.
  const [settled, setSettled] = useState("");

  const [errorState, setErrorState] = useState<{
    year: string;
    message: string;
  } | null>(null);

  // The current year, and whether a POST response already set it (so a GET
  // still in flight must not overwrite that newer result).
  const yearRef = useRef(year);
  const marked = useRef(false);

  useEffect(() => {
    yearRef.current = year;
    marked.current = false;
    if (year === "") return;
    // A new load starts without the last one's error.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErrorState(null);
    let cancelled = false;
    apiFetch<AllPlayedResponse>(`/played?year=${year}`, {}, fetchImpl)
      .then(({ played }) => {
        if (cancelled || marked.current) return;
        setErrorState(null);
        setLoaded({ year, played: toPlayedMaps(played) });
        setSettled(year);
      })
      .catch((e: unknown) => {
        if (cancelled || marked.current) return;
        setSettled(year);
        const expected =
          e instanceof ApiError &&
          (e.status === 401 || e.status === 403 || e.status === 404);
        if (!expected) {
          setErrorState({ year, message: "Couldn't load who has played." });
        }
      });
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
      announceChange("played");
      if (yearRef.current !== year) return;
      marked.current = true;
      setErrorState(null);
      setLoaded({ year, played: toPlayedMaps(played) });
      setSettled(year);
    },
    [year, fetchImpl],
  );

  return [
    loaded.year === year ? loaded.played : EMPTY,
    markPlayed,
    errorState?.year === year ? errorState.message : null,
    year !== "" && settled === year,
  ];
};

// Read-only: just the played maps.
const useAllPlayed = (year: string, fetchImpl?: typeof fetch) =>
  useMarkPlayed(year, fetchImpl)[0];

export default useAllPlayed;
