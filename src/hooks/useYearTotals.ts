import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useImportVersion } from "@/lib/scoresSync";
import type { YearTotal } from "@/types";

interface YearTotalsState {
  totals: YearTotal[];
  loading: boolean;
  error: boolean;
}

const isTotal = (t: unknown): t is YearTotal => {
  const r = t as Record<string, unknown> | null;
  return (
    !!r &&
    Number.isInteger(r.year) &&
    Number.isInteger(r.bgg_id) &&
    typeof r.total === "number"
  );
};

const parseTotals = (body: unknown): YearTotal[] => {
  const totals = (body as { totals?: unknown } | null)?.totals;
  if (!Array.isArray(totals) || !totals.every(isTotal)) {
    throw new Error("unexpected /api/years/totals body");
  }
  return totals;
};

const loadingState: YearTotalsState = {
  totals: [],
  loading: true,
  error: false,
};

// Every game's summed score per year, for the across-the-years sparkline.
// After an import (in any tab) the previous totals stay on screen until the
// refetch lands; a failed refetch keeps them, a failed first load reports the
// error.
const useYearTotals = (fetchImpl: typeof fetch = fetch): YearTotalsState => {
  const version = useImportVersion();
  const [state, setState] = useState<YearTotalsState | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>("/years/totals", {}, fetchImpl)
      .then((body) => ({
        totals: parseTotals(body),
        loading: false,
        error: false,
      }))
      .catch(() => ({ totals: [], loading: false, error: true }))
      .then((next) => {
        if (!cancelled) setState((prev) => (next.error && prev ? prev : next));
      });
    return () => {
      cancelled = true;
    };
    // version is the refetch trigger after an import; it is not read here.
  }, [version, fetchImpl]);

  return state ?? loadingState;
};

export default useYearTotals;
