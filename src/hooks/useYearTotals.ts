import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
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

// Every game's summed score per year, for the across-the-years sparkline.
const useYearTotals = (fetchImpl: typeof fetch = fetch): YearTotalsState => {
  const [state, setState] = useState<YearTotalsState>({
    totals: [],
    loading: true,
    error: false,
  });

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
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  return state;
};

export default useYearTotals;
