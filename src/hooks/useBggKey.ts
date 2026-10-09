import { useCallback, useEffect, useMemo, useState } from "react";

import { bggApi } from "@/lib/adminApi";
import { describeBggError } from "@/lib/bgg";
import type { BggKeyInfo, BggKeyTest } from "@/types";

// The BGG key: its masked state, plus save, remove and test. The key itself is
// only ever sent to the server, never read back.
const useBggKey = (fetchImpl: typeof fetch = fetch) => {
  const api = useMemo(() => bggApi(fetchImpl), [fetchImpl]);
  const [info, setInfo] = useState<BggKeyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<BggKeyTest | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getKey()
      .then((k) => !cancelled && setInfo(k))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const save = useCallback(
    async (apiKey: string): Promise<boolean> => {
      setActionError(null);
      try {
        setInfo(await api.putKey(apiKey));
        setTestResult(null);
        return true;
      } catch (e) {
        setActionError(describeBggError(e));
        return false;
      }
    },
    [api],
  );

  const remove = useCallback(async () => {
    setActionError(null);
    try {
      await api.deleteKey();
      setInfo({ configured: false, masked: null, updatedAt: null });
      setTestResult(null);
    } catch (e) {
      setActionError(describeBggError(e));
    }
  }, [api]);

  // Tests the typed candidate when given, otherwise the stored key.
  const test = useCallback(
    async (candidate?: string) => {
      setActionError(null);
      setTesting(true);
      try {
        setTestResult(await api.testKey(candidate));
      } catch (e) {
        setTestResult(null);
        setActionError(describeBggError(e));
      } finally {
        setTesting(false);
      }
    },
    [api],
  );

  return {
    info,
    loading,
    error,
    actionError,
    testing,
    testResult,
    save,
    remove,
    test,
  };
};

export default useBggKey;
