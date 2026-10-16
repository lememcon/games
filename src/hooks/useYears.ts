import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { loadGlobal } from "@/lib/globalDataCache";

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

// The years that have scores. Shared across hooks via the global data cache; an
// import or BGG job invalidates it, so the next mount fetches a fresh list.
const useYears = (fetchImpl: typeof fetch = fetch): YearsState => {
  const [state, setState] = useState<YearsState>({
    years: [],
    loading: true,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;
    loadGlobal("years", fetchImpl, async (f) =>
      parseYears(await apiFetch<unknown>("/years", {}, f)),
    )
      .then((years) => ({ years, loading: false, error: false }))
      .catch(() => ({ years: [], loading: false, error: true }))
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  return state;
};

export default useYears;
