import { useEffect } from "react";

import { startImportFeed } from "@/lib/importFeed";
import { remoteImport } from "@/lib/scoresSync";

// Polls for imports done elsewhere; mount once for the signed-in app.
const useImportFeed = (fetchImpl: typeof fetch = fetch): void => {
  useEffect(
    () =>
      startImportFeed({
        fetchVersion: async () => {
          const res = await fetchImpl("/api/data-version");
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as { version: string };
          return body.version;
        },
        onChange: remoteImport,
      }),
    [fetchImpl],
  );
};

export default useImportFeed;
