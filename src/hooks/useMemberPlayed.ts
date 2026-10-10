import { useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import type { AllPlayedCountsResponse } from "@/types";

type Counts = Record<string, number>;

export type MemberPlayedState =
  | { status: "loading" }
  | {
      status: "ready";
      // The member's counts for the recap year and each earlier year.
      byYear: Record<string, Counts>;
      // Every member's counts for the recap year.
      allCounts: Record<string, Counts>;
    }
  | { status: "error" };

const LOADING: MemberPlayedState = { status: "loading" };

// A year the server does not know is simply empty.
const readYear = async (
  year: string,
  fetchImpl: typeof fetch,
): Promise<AllPlayedCountsResponse["counts"]> => {
  try {
    const body = await apiFetch<AllPlayedCountsResponse>(
      `/played?year=${year}`,
      {},
      fetchImpl,
    );
    return body.counts;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return {};
    throw e;
  }
};

// One member's play counts for a year and the years before it, one request per
// year. The recap year's response also gives everyone's counts. An empty year
// ("") fetches nothing. State is tagged with its request key, so a superseded
// result is dropped.
const useMemberPlayed = (
  discordId: string,
  year: string,
  earlierYears: string[],
  fetchImpl: typeof fetch = fetch,
): MemberPlayedState => {
  const key =
    year === "" ? "" : JSON.stringify([discordId, year, earlierYears]);
  const [result, setResult] = useState<{
    key: string;
    state: MemberPlayedState;
  } | null>(null);

  useEffect(() => {
    if (key === "") return;
    let cancelled = false;
    const [, recapYear, earlier] = JSON.parse(key) as [
      string,
      string,
      string[],
    ];
    Promise.all([recapYear, ...earlier].map((y) => readYear(y, fetchImpl)))
      .then(([current, ...rest]): MemberPlayedState => {
        const byYear: Record<string, Counts> = {
          [recapYear]: current[discordId] ?? {},
        };
        earlier.forEach((y, i) => {
          byYear[y] = rest[i][discordId] ?? {};
        });
        return { status: "ready", byYear, allCounts: current };
      })
      .catch((): MemberPlayedState => ({ status: "error" }))
      .then((state) => {
        if (!cancelled) setResult({ key, state });
      });
    return () => {
      cancelled = true;
    };
  }, [key, discordId, fetchImpl]);

  return key !== "" && result?.key === key ? result.state : LOADING;
};

export default useMemberPlayed;
