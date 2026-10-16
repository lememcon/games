import { useEffect, useMemo, useRef, useState } from "react";

import { GENERIC_ERROR, describeApiError } from "@/lib/apiErrors";
import { vetoesByMember } from "@/lib/games";
import { bulkFailureMessage } from "@/lib/selection";
import { vetoesApi } from "@/lib/vetoesApi";
import type { Veto } from "@/types";

type All = ReturnType<typeof vetoesByMember>;

const EMPTY: All = {};

type Counts = Record<number, number>;

// Per-game in-flight save counts: a game stays locked until all its saves end.
const acquire = (counts: Counts, ids: number[]) =>
  ids.forEach((id) => (counts[id] = (counts[id] ?? 0) + 1));

// Returns the ids that no longer have a save in flight.
const release = (counts: Counts, ids: number[]) =>
  ids.filter((id) => --counts[id] === 0);

// What a veto scope needs from the API: the list and the member's own changes.
export interface VetoApi {
  list: () => Promise<{ vetoes: Veto[] }>;
  set: (bggId: number) => Promise<void>;
  clear: (bggId: number) => Promise<void>;
}

interface VetoSetOptions {
  // Forget everything (and ignore saves still in flight) when the key changes,
  // for scopes such as a year whose data must not leak into the next one.
  resetOnKeyChange?: boolean;
}

// One scope's vetoes (discord id, then bgg id as a string), plus veto and
// unveto for the signed-in member. A null api loads nothing. A failed load
// leaves the vetoes empty so nothing is hidden. Mutations are not optimistic:
// the list is refetched after each one. Saving and errors are tracked per
// game, so one save locks only its own game and a failure shows on that game.
// A new action on a game clears that game's error; errors persist until then.
// A newer action on a game, or clearError, supersedes older in-flight saves'
// errors.
// Only the newest list response is applied, so a slow earlier fetch can never
// overwrite a fresher one. The list is refetched when the key changes.
export const useVetoSet = (
  api: VetoApi | null,
  key: unknown,
  { resetOnKeyChange = false }: VetoSetOptions = {},
) => {
  const [all, setAll] = useState(EMPTY);
  const [saving, setSaving] = useState<ReadonlySet<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [bulkError, setBulkError] = useState<string | null>(null);
  const latest = useRef(0);
  const gens = useRef<Record<number, number>>({});
  const inflight = useRef<Counts>({});
  const apiRef = useRef(api);
  const keyRef = useRef(key);
  useEffect(() => {
    // Mirrors the render-time saving reset: saves from the old key no longer
    // count toward locks.
    if (resetOnKeyChange && keyRef.current !== key) inflight.current = {};
    apiRef.current = api;
    keyRef.current = key;
  });

  // Boxed, since a function key (fetchImpl) would be called as an initializer.
  const [seen, setSeen] = useState({ key });
  if (resetOnKeyChange && seen.key !== key) {
    setSeen({ key });
    setAll(EMPTY);
    setSaving(new Set());
    setErrors({});
    setBulkError(null);
  }

  const hasApi = api !== null;
  useEffect(() => {
    let cancelled = false;
    const mine = ++latest.current;
    apiRef.current
      ?.list()
      .then(
        (d) =>
          !cancelled &&
          mine === latest.current &&
          setAll(vetoesByMember(d.vetoes)),
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, hasApi]);

  const bump = (bggId: number) =>
    (gens.current[bggId] = (gens.current[bggId] ?? 0) + 1);

  // Ends one save per id; only games with no save left in flight unlock. A
  // reset replaced the counts, so the new scope owns the lock then.
  const unlock = (counts: Counts, ids: number[]) => {
    const done = release(counts, ids);
    if (inflight.current !== counts || done.length === 0) return;
    setSaving((prev) => {
      const next = new Set(prev);
      done.forEach((id) => next.delete(id));
      return next;
    });
  };

  // Resolves true when the change itself saved, false when it threw or the key
  // changed meanwhile.
  const mutate = async (
    bggId: number,
    run: (api: VetoApi) => Promise<void>,
  ): Promise<boolean> => {
    const scope = apiRef.current;
    const startKey = keyRef.current;
    if (!scope) return false;
    const gen = bump(bggId);
    const counts = inflight.current;
    acquire(counts, [bggId]);
    const stale = () => resetOnKeyChange && keyRef.current !== startKey;
    setSaving((prev) => new Set(prev).add(bggId));
    setErrors(({ [bggId]: _dropped, ...rest }) => rest);
    let message: string | null = null;
    let ok = true;
    try {
      await run(scope);
    } catch (e) {
      ok = false;
      message = describeApiError(e);
    }
    // A stale save must not touch the counter, or it would discard the new
    // key's own list fetch.
    if (stale()) return false;
    // Refetch either way so a stale view resyncs.
    const mine = ++latest.current;
    try {
      const d = await scope.list();
      if (mine === latest.current && !stale()) setAll(vetoesByMember(d.vetoes));
    } catch {
      if (mine === latest.current) message ??= GENERIC_ERROR;
    }
    if (stale()) return false;
    unlock(counts, [bggId]);
    if (message && gens.current[bggId] === gen)
      setErrors((prev) => ({ ...prev, [bggId]: message }));
    return ok;
  };

  // Vetoes many games with one refetch. Failures are reported together in
  // bulkError rather than per game; resolves with the ids that did not save,
  // or [] when the key changed meanwhile.
  const vetoMany = async (bggIds: number[]): Promise<number[]> => {
    const scope = apiRef.current;
    if (!scope || bggIds.length === 0) return [];
    const startKey = keyRef.current;
    const stale = () => resetOnKeyChange && keyRef.current !== startKey;
    const counts = inflight.current;
    acquire(counts, bggIds);
    setSaving((prev) => new Set([...prev, ...bggIds]));
    setBulkError(null);
    // async so a synchronous throw from scope.set becomes a rejection that
    // allSettled records; otherwise it would skip the unlock below.
    const results = await Promise.allSettled(
      bggIds.map(async (id) => scope.set(id)),
    );
    // A stale run must not touch the counter, or it would discard the new
    // key's own list fetch.
    if (stale()) return [];
    const failed = bggIds.filter((_, i) => results[i].status === "rejected");
    let message: string | null = null;
    if (failed.length === bggIds.length) {
      const first = results.find((r) => r.status === "rejected");
      message = describeApiError(first?.reason);
    } else if (failed.length > 0) {
      message = bulkFailureMessage(failed.length, bggIds.length);
    }
    const mine = ++latest.current;
    try {
      const d = await scope.list();
      if (mine === latest.current && !stale()) setAll(vetoesByMember(d.vetoes));
    } catch {
      if (mine === latest.current) message ??= GENERIC_ERROR;
    }
    if (stale()) return [];
    unlock(counts, bggIds);
    setBulkError(message);
    return failed;
  };

  return {
    all,
    saving,
    bulkError,
    vetoMany,
    clearBulkError: () => setBulkError(null),
    error: errors,
    isSaving: (bggId: number) => saving.has(bggId),
    errorFor: (bggId: number): string | null => errors[bggId] ?? null,
    clearError: (bggId: number) => {
      bump(bggId);
      setErrors(({ [bggId]: _dropped, ...rest }) => rest);
    },
    veto: (bggId: number) => mutate(bggId, (a) => a.set(bggId)),
    unveto: (bggId: number) => mutate(bggId, (a) => a.clear(bggId)),
  };
};

// Every member's vetoes that apply to every year, plus veto and unveto for
// the signed-in member. See useVetoSet.
const useVetoes = (fetchImpl: typeof fetch = fetch) =>
  useVetoSet(
    useMemo(() => vetoesApi(fetchImpl), [fetchImpl]),
    fetchImpl,
  );

export type VetoesState = ReturnType<typeof useVetoes>;

export default useVetoes;
