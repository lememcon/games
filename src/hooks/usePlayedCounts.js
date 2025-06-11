import { useCallback } from "react";

import { assoc, dec, dissoc, inc } from "ramda";

import useLocalState from "@/hooks/useLocalState";

const usePlayedCounts = () => {
  const [counts, setCounts] = useLocalState("played_counts", {});

  const decPlayedCount = useCallback(
    (id) => {
      const count = counts[id] || 0;

      if (count >= 2) {
        return setCounts(assoc(id, dec(count), counts));
      } else {
        return setCounts(dissoc(id, counts));
      }
    },
    [counts, setCounts],
  );

  const incPlayedCount = useCallback(
    (id) => {
      const count = counts[id] || 0;
      setCounts(assoc(id, inc(count), counts));
    },
    [counts, setCounts],
  );

  const getPlayedCount = useCallback(
    (id) => {
      return counts[id] || 0;
    },
    [counts],
  );

  return [getPlayedCount, incPlayedCount, decPlayedCount, counts];
};

export default usePlayedCounts;
