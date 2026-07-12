import { useCallback } from "react";

import { assoc, dec, dissoc, inc } from "ramda";

import useLocalState from "@/hooks/useLocalState";

type Counts = Record<string, number>;

const usePlayedCounts = (
  year: string,
): [
  (id: string) => number,
  (id: string) => void,
  (id: string) => void,
  Counts,
] => {
  const [counts, setCounts] = useLocalState<Counts>(
    `played_counts_${year}`,
    {},
  );

  const decPlayedCount = useCallback(
    (id: string) => {
      const count = counts[id] || 0;

      if (count >= 2) {
        return setCounts(assoc(id, dec(count), counts) as Counts);
      } else {
        return setCounts(dissoc(id, counts) as Counts);
      }
    },
    [counts, setCounts],
  );

  const incPlayedCount = useCallback(
    (id: string) => {
      const count = counts[id] || 0;
      setCounts(assoc(id, inc(count), counts) as Counts);
    },
    [counts, setCounts],
  );

  const getPlayedCount = useCallback(
    (id: string) => {
      return counts[id] || 0;
    },
    [counts],
  );

  return [getPlayedCount, incPlayedCount, decPlayedCount, counts];
};

export default usePlayedCounts;
