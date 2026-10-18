import { useEffect, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { useChangeVersion } from "@/lib/changeSync";
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
  const changes = useChangeVersion("profile");
  const [result, setResult] = useState<{
    id: string;
    state: ProfileState;
  } | null>(null);

  // Set by the effect for the id and version it last ran with.
  const last = useRef<{ id: string; changes: number } | null>(null);
  const shown = useRef<{ id: string; state: ProfileState } | null>(null);

  useEffect(() => {
    // Only the change version moved and a profile is already shown: a failed
    // refetch keeps it.
    const refresh =
      last.current?.id === discordId &&
      last.current.changes !== changes &&
      shown.current?.id === discordId &&
      shown.current.state.status === "ready";
    last.current = { id: discordId, changes };
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
        if (cancelled || (refresh && state.status !== "ready")) return;
        shown.current = { id: discordId, state };
        setResult({ id: discordId, state });
      });
    return () => {
      cancelled = true;
    };
  }, [discordId, fetchImpl, changes]);

  return result?.id === discordId ? result.state : LOADING;
};

export default useProfile;
