import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useImportVersion } from "@/lib/scoresSync";

interface YearsState {
  // Ascending, as strings: the year picker and localStorage both use strings.
  years: string[];
  loading: boolean;
  error: boolean;
}

const parseYears = (body: unknown): string[] => {
  const years = (body as { years?: unknown } | null)?.years;
  if (!Array.isArray(years) || !years.every(Number.isInteger)) {
    throw new Error("unexpected /api/years body");
  }
  return [...(years as number[])].sort((a, b) => a - b).map(String);
};

const loadingState: YearsState = { years: [], loading: true, error: false };

// The years that have scores. Loaded on mount, and again after an import in
// this or another tab; until then it reports loading, never the old list.
const useYears = (fetchImpl: typeof fetch = fetch): YearsState => {
  const version = useImportVersion();
  const [state, setState] = useState<{
    version: number;
    value: YearsState;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>("/years", {}, fetchImpl)
      .then((body) => ({
        years: parseYears(body),
        loading: false,
        error: false,
      }))
      .catch(() => ({ years: [], loading: false, error: true }))
      .then((next) => {
        if (!cancelled) setState({ version, value: next });
      });
    return () => {
      cancelled = true;
    };
  }, [version, fetchImpl]);

  return state?.version === version ? state.value : loadingState;
};

export default useYears;
