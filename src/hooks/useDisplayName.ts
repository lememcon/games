import { useCallback, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { GENERIC_ERROR, isAuthError } from "@/lib/apiErrors";
import type { DisplayNameResult } from "@/types";

const describe = (e: unknown): string => {
  if (!(e instanceof ApiError)) return GENERIC_ERROR;
  if (e.status === 409) return "That name is already taken.";
  if (e.message === "invalid_name")
    return "That name isn't allowed. Use 1 to 32 visible characters.";
  if (isAuthError(e)) return "You need to be signed in as an approved member.";
  return GENERIC_ERROR;
};

// Sets (or, with null, clears) the signed-in member's display name. `onSaved`
// runs after a successful save so the caller can refresh the account.
const useDisplayName = (
  onSaved: () => void,
  fetchImpl: typeof fetch = fetch,
) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (displayName: string | null): Promise<DisplayNameResult | null> => {
      setSaving(true);
      setError(null);
      try {
        const result = await apiFetch<DisplayNameResult>(
          "/me/display-name",
          { method: "PUT", body: { displayName } },
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

export default useDisplayName;
