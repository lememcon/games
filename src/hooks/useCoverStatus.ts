import { useCallback, useEffect, useMemo, useState } from "react";

import { coverApi } from "@/lib/adminApi";
import { isRunning } from "@/lib/bgg";
import { describeCoverError } from "@/lib/coverJob";
import type { CoverStatus } from "@/types";

const POLL_MS = 2000;

// Cover status plus the mirror job. While a job runs it polls only GET /job;
// /status is refetched once when the job ends.
const useCoverStatus = (fetchImpl: typeof fetch = fetch) => {
  const api = useMemo(() => coverApi(fetchImpl), [fetchImpl]);
  const [status, setStatus] = useState<CoverStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.getStatus());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    // Initial load; setState runs after the awaited request, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const running = isRunning(status?.job);
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const job = await api.getJob();
        if (stopped) return;
        if (isRunning(job)) {
          setStatus((s) => (s ? { ...s, job } : s));
        } else {
          // Ended: the pending count changed, so refetch /status once.
          await refresh();
          return;
        }
      } catch {
        // A failed poll is retried on the next tick.
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [running, api, refresh]);

  const mirror = useCallback(async () => {
    setActionError(null);
    try {
      const job = await api.mirror();
      setStatus((s) => (s ? { ...s, job } : s));
      if (!isRunning(job)) await refresh();
    } catch (e) {
      setActionError(describeCoverError(e));
    }
  }, [api, refresh]);

  const cancel = useCallback(async () => {
    setActionError(null);
    try {
      const job = await api.cancelJob();
      setStatus((s) => (s ? { ...s, job } : s));
      await refresh();
    } catch (e) {
      setActionError(describeCoverError(e));
    }
  }, [api, refresh]);

  return { status, loading, error, actionError, refresh, mirror, cancel };
};

export default useCoverStatus;
