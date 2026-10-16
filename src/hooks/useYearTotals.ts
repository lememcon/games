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
// State is tagged with the import version it belongs to, so after an import
// (in any tab) it reads as loading until the refetch lands.
const useYearTotals = (fetchImpl: typeof fetch = fetch): YearTotalsState => {
  const version = useImportVersion();
  const [state, setState] = useState<{
    version: number;
    value: YearTotalsState;
  } | null>(null);

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
        if (!cancelled) setState({ version, value: next });
      });
    return () => {
      cancelled = true;
    };
  }, [version, fetchImpl]);

  return state?.version === version ? state.value : loadingState;
};

export default useYearTotals;
