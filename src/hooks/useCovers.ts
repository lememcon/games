import { useMemo } from "react";

import useGames from "@/hooks/useGames";
import { resolveImage } from "@/lib/games";
import images from "@/lib/images";

/** Cover URL by BGG id for every game that has one; empty while loading or on error. */
const useCovers = (fetchImpl: typeof fetch = fetch): Record<string, string> => {
  const { games } = useGames(fetchImpl);
  return useMemo(() => {
    const covers: Record<string, string> = {};
    for (const [id, meta] of Object.entries(games)) {
      const url = resolveImage(id, meta, images);
      if (url) covers[id] = url;
    }
    return covers;
  }, [games]);
};

export default useCovers;
