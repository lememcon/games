import { useCallback, useEffect, useMemo, useState } from "react";

import { bggApi } from "@/lib/adminApi";
import { describeBggError, isRunning } from "@/lib/bgg";
import type { BggDownloadRequest, BggStatus } from "@/types";

const POLL_MS = 2000;

// Game status plus the download job. While a job runs it polls only GET /job
// (cheap); /status is refetched once when the job ends.
const useBggStatus = (fetchImpl: typeof fetch = fetch) => {
  const api = useMemo(() => bggApi(fetchImpl), [fetchImpl]);
  const [status, setStatus] = useState<BggStatus | null>(null);
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
          // Ended: the counts changed, so refetch /status once.
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

  const download = useCallback(
    async (req: BggDownloadRequest) => {
      setActionError(null);
      try {
        const job = await api.download(req);
        setStatus((s) => (s ? { ...s, job } : s));
        // An empty job ends before the first poll, so check once right away.
        if (!isRunning(job)) await refresh();
      } catch (e) {
        setActionError(describeBggError(e));
      }
    },
    [api, refresh],
  );

  const cancel = useCallback(async () => {
    setActionError(null);
    try {
      const job = await api.cancelJob();
      setStatus((s) => (s ? { ...s, job } : s));
    } catch (e) {
      setActionError(describeBggError(e));
    }
  }, [api]);

  return { status, loading, error, actionError, refresh, download, cancel };
};

export default useBggStatus;
