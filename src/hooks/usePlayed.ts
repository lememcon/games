import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { announceChange, useChangeVersion } from "@/lib/changeSync";
import { toPlayedMap, type PlayedMap } from "@/lib/played";
import { clearLegacyCounts, readLegacyPlayed } from "@/lib/playedMigration";
import type { PlayedResponse } from "@/types";

// Everything one year's load and edits share. A new one replaces it when the
// year changes, and the old one stops acting (`cancelled`).
interface Session {
  year: string;
  cancelled: boolean;
  // Edits are ignored until the server's played games (and any import) are in.
  ready: boolean;
  // What the member sees; toggles compute from it so rapid clicks flip it.
  desired: PlayedMap;
  // The last value the server acknowledged, for rolling back.
  confirmed: PlayedMap;
  // At most one write per game is in flight.
  inFlight: Set<string>;
  // A clear-all is waiting on the server: toggles and further clears are
  // ignored until it settles.
  clearing: boolean;
  // Counts every local edit and every time a write settles; a refresh only
  // applies if it did not move while the GET was out.
  writes: number;
  // Another tab changed the list and this tab has not caught up yet.
  stale: boolean;
  // A refresh GET is out; only one runs at a time.
  refreshing: boolean;
  // Refreshes if stale and the session is idle; a no-op otherwise.
  run: () => void;
}

const idle = (s: Session) => s.inFlight.size === 0 && !s.clearing;

const withPlayed = (map: PlayedMap, id: string, played: boolean): PlayedMap => {
  if (played) return { ...map, [id]: 1 };
  const { [id]: _removed, ...rest } = map;
  return rest;
};

// Sends the latest wanted value for a game unless a write is in flight or the
// server already has it. Runs again when a write settles.
function flush(
  s: Session,
  id: string,
  fetchImpl: typeof fetch,
  onRollback: (played: PlayedMap) => void,
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
      s.writes += 1;
      if (ok) {
        s.confirmed = withPlayed(s.confirmed, id, want);
        announceChange("played");
      }
      // A newer change is sent as is (after a failure too); otherwise a
      // failed write goes back to what the server has. A cancelled session
      // still sends what was wanted but no longer updates the screen.
      else if (id in s.desired === want) {
        s.desired = withPlayed(s.desired, id, id in s.confirmed);
        if (!s.cancelled) onRollback(s.desired);
      }
      flush(s, id, fetchImpl, onRollback);
      s.run();
    });
}

// The signed-in member's played games for a year, kept on the server. Edits show
// at once and are written as absolute flags, one request per game at a time.
// The fourth function clears every game at once with a single DELETE; when it
// settles, each game is reconciled with any write that settled around it.
const usePlayed = (
  year: string,
  fetchImpl: typeof fetch = fetch,
): [
  (id: string) => boolean,
  (id: string) => void,
  PlayedMap | null,
  (id: string) => void,
  string | null,
  () => void,
] => {
  const [shown, setShown] = useState<{
    year: string;
    played: PlayedMap | null;
  }>({
    year,
    played: null,
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
    // A new load starts without the last one's error.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErrorState(null);
    const s: Session = {
      year,
      cancelled: false,
      ready: false,
      desired: {},
      confirmed: {},
      inFlight: new Set(),
      clearing: false,
      writes: 0,
      stale: false,
      refreshing: false,
      run: () => {},
    };
    session.current = s;

    // Reloads the list after another tab changed it. The answer is dropped
    // when this tab wrote anything while it was out, or is writing now, so it
    // can never undo a local edit; a dropped answer is retried when idle.
    s.run = () => {
      if (s.cancelled || !s.ready || !s.stale || s.refreshing || !idle(s))
        return;
      s.stale = false;
      s.refreshing = true;
      const writes = s.writes;
      apiFetch<PlayedResponse>(`/me/played?year=${year}`, {}, fetchImpl)
        .then(
          (body) => toPlayedMap(body.played),
          () => null,
        )
        .then((played) => {
          s.refreshing = false;
          if (s.cancelled) return;
          if (played) {
            if (s.writes === writes && idle(s)) {
              s.confirmed = played;
              s.desired = played;
              setShown({ year, played });
            } else s.stale = true;
          }
          s.run();
        });
    };

    const load = async () => {
      let played: PlayedMap;
      try {
        const body = await apiFetch<PlayedResponse>(
          `/me/played?year=${year}`,
          {},
          fetchImpl,
        );
        played = toPlayedMap(body.played);
      } catch (e) {
        // Not signed in, not approved or an unknown year is expected: nothing
        // played, no edits, no message. Anything else is a failure worth showing.
        const expected =
          e instanceof ApiError &&
          (e.status === 401 || e.status === 403 || e.status === 404);
        if (!expected && !s.cancelled) {
          setErrorState({ year, message: "Couldn't load your played games." });
        }
        return;
      }
      if (s.cancelled) return;

      const legacy = readLegacyPlayed(year);
      if (legacy) {
        try {
          const body = await apiFetch<PlayedResponse>(
            `/me/played/${year}/import`,
            { method: "POST", body: { games: legacy } },
            fetchImpl,
          );
          played = toPlayedMap(body.played);
          if (s.cancelled) return;
          clearLegacyCounts(year);
        } catch (e) {
          if (s.cancelled) return;
          // An unknown year will not become known by retrying.
          if (e instanceof ApiError && e.status === 404) return;
          // Otherwise keep the old data for the next load and use the server's.
        }
      }

      s.confirmed = played;
      s.desired = played;
      s.ready = true;
      setErrorState(null);
      setShown({ year, played });
      s.run();
    };
    void load();

    return () => {
      s.cancelled = true;
    };
  }, [year, fetchImpl]);

  // Another tab changed the played games. Before this tab's own load is in it
  // is only remembered (stale); the end of the load then refreshes once.
  const changes = useChangeVersion("played");
  const seenChanges = useRef(changes);
  useEffect(() => {
    if (seenChanges.current === changes) return;
    seenChanges.current = changes;
    const s = session.current;
    if (!s) return;
    s.stale = true;
    s.run();
  }, [changes]);

  const toggle = useCallback(
    (id: string) => {
      const s = session.current;
      if (!s?.ready || s.clearing) return;
      s.writes += 1;
      s.desired = withPlayed(s.desired, id, !(id in s.desired));
      setErrorState(null);
      setShown({ year: s.year, played: s.desired });
      flush(s, id, fetchImpl, (played) => {
        setShown({ year: s.year, played });
        setErrorState({ year: s.year, message: "Couldn't save. Try again." });
      });
    },
    [fetchImpl],
  );

  // Shows a game as played that the server already has, so nothing is sent.
  const markConfirmed = useCallback((id: string) => {
    const s = session.current;
    if (!s?.ready || s.clearing) return;
    s.writes += 1;
    s.desired = withPlayed(s.desired, id, true);
    s.confirmed = withPlayed(s.confirmed, id, true);
    setShown({ year: s.year, played: s.desired });
  }, []);

  // Empties the list at once and sends one DELETE. A failure restores what was
  // shown before.
  const clear = useCallback(() => {
    const s = session.current;
    if (!s?.ready || s.clearing) return;
    const snapshot = s.desired;
    s.writes += 1;
    s.clearing = true;
    s.desired = {};
    setErrorState(null);
    setShown({ year: s.year, played: s.desired });
    const onRollback = (played: PlayedMap) => {
      setShown({ year: s.year, played });
      setErrorState({ year: s.year, message: "Couldn't save. Try again." });
    };
    apiFetch(`/me/played/${s.year}`, { method: "DELETE" }, fetchImpl)
      .then(
        () => true,
        () => false,
      )
      .then((ok) => {
        s.clearing = false;
        s.writes += 1;
        const ids = new Set([
          ...Object.keys(s.desired),
          ...Object.keys(s.confirmed),
          ...Object.keys(snapshot),
        ]);
        if (ok) {
          s.confirmed = {};
          announceChange("played");
        } else s.desired = snapshot;
        if (!s.cancelled) {
          setShown({ year: s.year, played: s.desired });
          if (!ok)
            setErrorState({
              year: s.year,
              message: "Couldn't clear your games. Try again.",
            });
        }
        for (const id of ids) flush(s, id, fetchImpl, onRollback);
        s.run();
      });
  }, [fetchImpl]);

  // Null until the played games for this year are in; {} once loaded and empty.
  const played = shown.year === year ? shown.played : null;
  const isPlayed = useCallback((id: string) => !!played?.[id], [played]);

  const error = errorState?.year === year ? errorState.message : null;

  return [isPlayed, toggle, played, markConfirmed, error, clear];
};

export default usePlayed;
