import { useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import type { Profile } from "@/types";

export type ProfileState =
  | { status: "loading" }
  | { status: "ready"; profile: Profile }
  | { status: "not_found" }
  | { status: "error" };

const LOADING: ProfileState = { status: "loading" };

// One member's public profile. State is tagged with the id it belongs to, so a
// response for a superseded id is dropped and never shown for the new one.
const useProfile = (
  discordId: string,
  fetchImpl: typeof fetch = fetch,
): ProfileState => {
  const [result, setResult] = useState<{
    id: string;
    state: ProfileState;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Profile>(
      `/profiles/${encodeURIComponent(discordId)}`,
      {},
      fetchImpl,
    )
      .then((profile): ProfileState => ({ status: "ready", profile }))
      .catch((e): ProfileState =>
        e instanceof ApiError && (e.status === 404 || e.status === 400)
          ? { status: "not_found" }
          : { status: "error" },
      )
      .then((state) => {
        if (!cancelled) setResult({ id: discordId, state });
      });
    return () => {
      cancelled = true;
    };
  }, [discordId, fetchImpl]);

  return result?.id === discordId ? result.state : LOADING;
};

export default useProfile;
