import { useCallback, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { GENERIC_ERROR, isAuthError } from "@/lib/apiErrors";
import type { ColorResult } from "@/types";

const describe = (e: unknown): string =>
  e instanceof ApiError && isAuthError(e)
    ? "You need to be signed in as an approved member."
    : GENERIC_ERROR;

// Sets (or, with null, clears) the signed-in member's name color. `onSaved`
// runs after a successful save so the caller can refresh the account.
const useColor = (onSaved: () => void, fetchImpl: typeof fetch = fetch) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (color: string | null): Promise<ColorResult | null> => {
      setSaving(true);
      setError(null);
      try {
        const result = await apiFetch<ColorResult>(
          "/me/color",
          { method: "PUT", body: { color } },
          fetchImpl,
        );
        onSaved();
        return result;
      } catch (e) {
        setError(describe(e));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [fetchImpl, onSaved],
  );

  return { save, saving, error };
};

export default useColor;
