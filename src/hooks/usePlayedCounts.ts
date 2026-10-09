import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import {
  MAX_PLAYED_COUNT,
  clearLegacyCounts,
  readLegacyCounts,
} from "@/lib/playedMigration";
import type { PlayedCountsResponse } from "@/types";

type Counts = PlayedCountsResponse["counts"];

// Everything one year's load and edits share. A new one replaces it when the
// year changes, and the old one stops acting (`cancelled`).
interface Session {
  year: string;
  cancelled: boolean;
  // Edits are ignored until the server's counts (and any import) are in.
  ready: boolean;
  // What the member sees; inc and dec compute from it so rapid clicks add up.
  desired: Counts;
  // The last value the server acknowledged, for rolling back.
  confirmed: Counts;
  // At most one write per game is in flight.
  inFlight: Set<string>;
}

const EMPTY: Counts = {};

const withCount = (counts: Counts, id: string, count: number): Counts => {
  if (count > 0) return { ...counts, [id]: count };
  const { [id]: _removed, ...rest } = counts;
  return rest;
};

// Sends the latest wanted value for a game unless a write is in flight or the
// server already has it. Runs again when a write settles.
function flush(
  s: Session,
  id: string,
  fetchImpl: typeof fetch,
  onRollback: (counts: Counts) => void,
) {
  const want = s.desired[id] ?? 0;
  if (s.inFlight.has(id) || want === (s.confirmed[id] ?? 0)) return;

  s.inFlight.add(id);
  apiFetch(
    `/me/played/${s.year}/${id}`,
    { method: "PUT", body: { count: want } },
    fetchImpl,
  )
    .then(
      () => true,
      () => false,
    )
    .then((ok) => {
      s.inFlight.delete(id);
      if (s.cancelled) return;
      if (ok) s.confirmed = withCount(s.confirmed, id, want);
      // A newer change is sent as is (after a failure too); otherwise a
      // failed write goes back to what the server has.
      else if ((s.desired[id] ?? 0) === want) {
        s.desired = withCount(s.desired, id, s.confirmed[id] ?? 0);
        onRollback(s.desired);
      }
      flush(s, id, fetchImpl, onRollback);
    });
}

// The signed-in member's play counts for a year, kept on the server. Edits show
// at once and are written as absolute counts, one request per game at a time.
const usePlayedCounts = (
  year: string,
  fetchImpl: typeof fetch = fetch,
): [
  (id: string) => number,
  (id: string) => void,
  (id: string) => void,
  Counts,
] => {
  const [shown, setShown] = useState<{ year: string; counts: Counts }>({
    year,
    counts: EMPTY,
  });
  const session = useRef<Session | null>(null);

  useEffect(() => {
    if (year === "") {
      session.current = null;
      return;
    }
    const s: Session = {
      year,
      cancelled: false,
      ready: false,
      desired: {},
      confirmed: {},
      inFlight: new Set(),
    };
    session.current = s;

    const load = async () => {
      let counts: Counts;
      try {
        ({ counts } = await apiFetch<PlayedCountsResponse>(
          `/me/played?year=${year}`,
          {},
          fetchImpl,
        ));
      } catch {
        // Not signed in, unknown year or a failure: no counts, no edits.
        return;
      }
      if (s.cancelled) return;

      const legacy = readLegacyCounts(year);
      if (legacy) {
        try {
          ({ counts } = await apiFetch<PlayedCountsResponse>(
            `/me/played/${year}/import`,
            { method: "POST", body: { counts: legacy } },
            fetchImpl,
          ));
          if (s.cancelled) return;
          clearLegacyCounts(year);
        } catch (e) {
          if (s.cancelled) return;
          // An unknown year will not become known by retrying.
          if (e instanceof ApiError && e.status === 404) return;
          // Otherwise keep the old data for the next load and use the server's.
        }
      }

      s.confirmed = counts;
      s.desired = counts;
      s.ready = true;
      setShown({ year, counts });
    };
    void load();

    return () => {
      s.cancelled = true;
    };
  }, [year, fetchImpl]);

  const change = useCallback(
    (id: string, delta: 1 | -1) => {
      const s = session.current;
      if (!s?.ready) return;
      const current = s.desired[id] ?? 0;
      const next = Math.min(Math.max(current + delta, 0), MAX_PLAYED_COUNT);
      if (next === current) return;
      s.desired = withCount(s.desired, id, next);
      setShown({ year: s.year, counts: s.desired });
      flush(s, id, fetchImpl, (counts) => setShown({ year: s.year, counts }));
    },
    [fetchImpl],
  );

  const incPlayedCount = useCallback((id: string) => change(id, 1), [change]);
  const decPlayedCount = useCallback((id: string) => change(id, -1), [change]);

  const counts = shown.year === year ? shown.counts : EMPTY;
  const getPlayedCount = useCallback((id: string) => counts[id] || 0, [counts]);

  return [getPlayedCount, incPlayedCount, decPlayedCount, counts];
};

export default usePlayedCounts;
