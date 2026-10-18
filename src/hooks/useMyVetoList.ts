import { useCallback, useEffect, useRef, useState } from "react";

import { GENERIC_ERROR, describeApiError } from "@/lib/apiErrors";
import { announceChange, useChangeVersion } from "@/lib/changeSync";
import { vetoesApi } from "@/lib/vetoesApi";

type Api = ReturnType<typeof vetoesApi>;

// The signed-in member's vetoes for one scope. `pick` selects the list call
// from the API; define it at module level so the load effect only depends on
// fetchImpl. Not optimistic: the list is refetched after each change.
const useMyVetoList = <T>(
  fetchImpl: typeof fetch,
  pick: (api: Api) => () => Promise<{ vetoes: T[] }>,
  messages?: Record<string, string>,
) => {
  const [vetoes, setVetoes] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  // Counts every list request; only the latest one's answer is applied.
  const latest = useRef(0);
  const changes = useChangeVersion("vetoes");

  useEffect(() => {
    let cancelled = false;
    const id = ++latest.current;
    const current = () => !cancelled && id === latest.current;
    pick(vetoesApi(fetchImpl))()
      .then((d) => current() && setVetoes(d.vetoes))
      .catch(() => current() && setError(GENERIC_ERROR))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchImpl, pick, changes]);

  // Runs one mutation then refetches; a second call while one runs is ignored.
  // Resolves true only when the change and the refetch both succeeded.
  const mutate = useCallback(
    async (run: () => Promise<void>) => {
      if (busy.current) return false;
      busy.current = true;
      setSaving(true);
      setError(null);
      let ok = false;
      try {
        await run();
        announceChange("vetoes");
        const id = ++latest.current;
        const d = await pick(vetoesApi(fetchImpl))();
        if (id === latest.current) setVetoes(d.vetoes);
        ok = true;
      } catch (e) {
        setError(describeApiError(e, messages));
      }
      busy.current = false;
      setSaving(false);
      return ok;
    },
    [fetchImpl, pick, messages],
  );

  return { vetoes, loading, saving, error, mutate };
};

export default useMyVetoList;
