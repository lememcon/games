import { useCallback, useEffect, useMemo, useState } from "react";

import { coverStorageApi } from "@/lib/adminApi";
import { describeStorageError } from "@/lib/coverStorage";
import type {
  CoverStorageInfo,
  CoverStorageInput,
  CoverStorageTest,
} from "@/types";

// The cover storage settings: their masked state, plus save, clear and test.
// The secret is only ever sent to the server, never read back.
const useCoverStorage = (fetchImpl: typeof fetch = fetch) => {
  const api = useMemo(() => coverStorageApi(fetchImpl), [fetchImpl]);
  const [info, setInfo] = useState<CoverStorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<CoverStorageTest | null>(null);

  const load = useCallback(() => api.get().then(setInfo), [api]);

  useEffect(() => {
    let cancelled = false;
    api
      .get()
      .then((i) => !cancelled && setInfo(i))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const save = useCallback(
    async (input: CoverStorageInput): Promise<boolean> => {
      setActionError(null);
      try {
        setInfo(await api.put(input));
        setTestResult(null);
        return true;
      } catch (e) {
        setActionError(describeStorageError(e));
        return false;
      }
    },
    [api],
  );

  // Removing the override falls back to the server environment, so reload.
  const clear = useCallback(async () => {
    setActionError(null);
    try {
      await api.clear();
      await load();
      setTestResult(null);
    } catch (e) {
      setActionError(describeStorageError(e));
    }
  }, [api, load]);

  // Tests the given unsaved input, otherwise the saved settings.
  const test = useCallback(
    async (input?: CoverStorageInput) => {
      setActionError(null);
      setTesting(true);
      try {
        setTestResult(await api.test(input));
      } catch (e) {
        setTestResult(null);
        setActionError(describeStorageError(e));
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
    clear,
    test,
  };
};

export default useCoverStorage;
