import { useEffect, useMemo, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { GENERIC_ERROR } from "@/lib/apiErrors";
import { vetoesByMember } from "@/lib/games";
import { bulkFailureMessage } from "@/lib/selection";
import { vetoesApi } from "@/lib/vetoesApi";
import type { Veto } from "@/types";

const MESSAGES: Record<string, string> = {
  unknown_game: "That game no longer exists.",
  unknown_year: "That year no longer exists.",
};

const describe = (e: unknown): string =>
  (e instanceof ApiError && MESSAGES[e.message]) || GENERIC_ERROR;

type All = ReturnType<typeof vetoesByMember>;

const EMPTY: All = {};

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
  const apiRef = useRef(api);
  const keyRef = useRef(key);
  useEffect(() => {
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

  // Resolves true when the change itself saved, false when it threw or the key
  // changed meanwhile.
  const mutate = async (
    bggId: number,
    run: (api: VetoApi) => Promise<void>,
  ): Promise<boolean> => {
    const scope = apiRef.current;
    const startKey = keyRef.current;
    if (!scope) return false;
    const stale = () => resetOnKeyChange && keyRef.current !== startKey;
    setSaving((prev) => new Set(prev).add(bggId));
    setErrors(({ [bggId]: _dropped, ...rest }) => rest);
    let message: string | null = null;
    let ok = true;
    try {
      await run(scope);
    } catch (e) {
      ok = false;
      message = describe(e);
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
    setSaving((prev) => {
      const next = new Set(prev);
      next.delete(bggId);
      return next;
    });
    if (message) setErrors((prev) => ({ ...prev, [bggId]: message }));
    return ok;
  };

  // Vetoes many games with one refetch. Failures are reported together in
  // bulkError rather than per game; resolves with the ids that did not save.
  const vetoMany = async (bggIds: number[]): Promise<number[]> => {
    const scope = apiRef.current;
    if (!scope || bggIds.length === 0) return [];
    setSaving((prev) => new Set([...prev, ...bggIds]));
    setBulkError(null);
    const results = await Promise.allSettled(bggIds.map((id) => scope.set(id)));
    const failed = bggIds.filter((_, i) => results[i].status === "rejected");
    let message: string | null = null;
    if (failed.length === bggIds.length) {
      const first = results.find((r) => r.status === "rejected");
      message = describe(first?.reason);
    } else if (failed.length > 0) {
      message = bulkFailureMessage(failed.length, bggIds.length);
    }
    const mine = ++latest.current;
    try {
      const d = await scope.list();
      if (mine === latest.current) setAll(vetoesByMember(d.vetoes));
    } catch {
      if (mine === latest.current) message ??= GENERIC_ERROR;
    }
    setSaving((prev) => {
      const next = new Set(prev);
      bggIds.forEach((id) => next.delete(id));
      return next;
    });
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
