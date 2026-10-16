import { useEffect, useState } from "react";

import { load } from "@/lib/scoresCache";
import { useImportVersion } from "@/lib/scoresSync";
import type { Data } from "@/types";

const pending: Data = {
  loading: true,
  scores: [],
  by_game: {},
  by_player: {},
  by_id: {},
  max: 0,
};

const failed: Data = { ...pending, loading: false, error: true };

// Scores for one year. A null year (not known yet) fetches nothing and stays
// loading. State is tagged with the year and import version it belongs to, so
// a response for a superseded year, or from before an import, is dropped and
// old data is never shown.
const useData = (
  year: string | null,
  fetchImpl: typeof fetch = fetch,
): Data => {
  const version = useImportVersion();
  const [result, setResult] = useState<{
    year: string;
    version: number;
    data: Data;
  } | null>(null);

  useEffect(() => {
    if (year === null) return;
    let cancelled = false;

    load(year, fetchImpl)
      .catch(() => failed)
      .then((data) => {
        if (!cancelled) setResult({ year, version, data });
      });

    return () => {
      cancelled = true;
    };
  }, [year, version, fetchImpl]);

  return year !== null && result?.year === year && result.version === version
    ? result.data
    : pending;
};

export default useData;
