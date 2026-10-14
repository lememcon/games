import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { toPlayedMap, type PlayedMap } from "@/lib/played";
import { clearLegacyCounts, readLegacyPlayed } from "@/lib/playedMigration";
import type { PlayedCountsResponse } from "@/types";

type Counts = PlayedMap;

// Everything one year's load and edits share. A new one replaces it when the
// year changes, and the old one stops acting (`cancelled`).
interface Session {
  year: string;
  cancelled: boolean;
  // Edits are ignored until the server's played games (and any import) are in.
  ready: boolean;
  // What the member sees; toggles compute from it so rapid clicks flip it.
  desired: Counts;
  // The last value the server acknowledged, for rolling back.
  confirmed: Counts;
  // At most one write per game is in flight.
  inFlight: Set<string>;
}

const withPlayed = (counts: Counts, id: string, played: boolean): Counts => {
  if (played) return { ...counts, [id]: 1 };
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
  const want = id in s.desired;
  if (s.inFlight.has(id) || want === id in s.confirmed) return;

  s.inFlight.add(id);
  apiFetch(
    `/me/played/${s.year}/${id}`,
    { method: "PUT", body: { played: want } },
    fetchImpl,
  )
    .then(
      () => true,
      () => false,
    )
    .then((ok) => {
      s.inFlight.delete(id);
      if (ok) s.confirmed = withPlayed(s.confirmed, id, want);
      // A newer change is sent as is (after a failure too); otherwise a
      // failed write goes back to what the server has. A cancelled session
      // still sends what was wanted but no longer updates the screen.
      else if (id in s.desired === want) {
        s.desired = withPlayed(s.desired, id, id in s.confirmed);
        if (!s.cancelled) onRollback(s.desired);
      }
      flush(s, id, fetchImpl, onRollback);
    });
}

// The signed-in member's played games for a year, kept on the server. Edits show
// at once and are written as absolute flags, one request per game at a time.
const usePlayedCounts = (
  year: string,
  fetchImpl: typeof fetch = fetch,
): [
  (id: string) => boolean,
  (id: string) => void,
  Counts | null,
  (id: string) => void,
  string | null,
] => {
  const [shown, setShown] = useState<{ year: string; counts: Counts | null }>({
    year,
    counts: null,
  });
  const [errorState, setErrorState] = useState<{
    year: string;
    message: string;
  } | null>(null);
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
        const body = await apiFetch<PlayedCountsResponse>(
          `/me/played?year=${year}`,
          {},
          fetchImpl,
        );
        counts = toPlayedMap(body.played);
      } catch (e) {
        // Not signed in or an unknown year is expected: nothing played, no
        // edits, no message. Anything else is a failure worth showing.
        const expected =
          e instanceof ApiError && (e.status === 401 || e.status === 404);
        if (!expected && !s.cancelled) {
          setErrorState({ year, message: "Couldn't load your played games." });
        }
        return;
      }
      if (s.cancelled) return;

      const legacy = readLegacyPlayed(year);
      if (legacy) {
        try {
          const body = await apiFetch<PlayedCountsResponse>(
            `/me/played/${year}/import`,
            { method: "POST", body: { games: legacy } },
            fetchImpl,
          );
          counts = toPlayedMap(body.played);
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
      setErrorState(null);
      setShown({ year, counts });
    };
    void load();

    return () => {
      s.cancelled = true;
    };
  }, [year, fetchImpl]);

  const toggle = useCallback(
    (id: string) => {
      const s = session.current;
      if (!s?.ready) return;
      s.desired = withPlayed(s.desired, id, !(id in s.desired));
      setErrorState(null);
      setShown({ year: s.year, counts: s.desired });
      flush(s, id, fetchImpl, (counts) => {
        setShown({ year: s.year, counts });
        setErrorState({ year: s.year, message: "Couldn't save. Try again." });
      });
    },
    [fetchImpl],
  );

  // Shows a game as played that the server already has, so nothing is sent.
  const markConfirmed = useCallback((id: string) => {
    const s = session.current;
    if (!s?.ready) return;
    s.desired = withPlayed(s.desired, id, true);
    s.confirmed = withPlayed(s.confirmed, id, true);
    setShown({ year: s.year, counts: s.desired });
  }, []);

  // Null until the played games for this year are in; {} once loaded and empty.
  const counts = shown.year === year ? shown.counts : null;
  const isPlayed = useCallback((id: string) => !!counts?.[id], [counts]);

  const error = errorState?.year === year ? errorState.message : null;

  return [isPlayed, toggle, counts, markConfirmed, error];
};

export default usePlayedCounts;
