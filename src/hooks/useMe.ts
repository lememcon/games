import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useChangeVersion } from "@/lib/changeSync";
import type { Me } from "@/types";

const isMe = (body: unknown): body is Me => {
  if (typeof body !== "object" || body === null) return false;
  const { status, user } = body as { status?: unknown; user?: unknown };
  if (status === "anonymous") return true;
  return (
    status === "approved" &&
    typeof user === "object" &&
    user !== null &&
    typeof (user as { discordId?: unknown }).discordId === "string"
  );
};

interface MeState {
  me: Me | null;
  error: boolean;
  loading: boolean;
}

// Loads the signed-in account. Failures and unexpected bodies are an error
// state (never "anonymous"); retry is manual and ignored while a request is in
// flight. Responses from superseded requests are dropped. A quiet request (a
// profile change from another tab) never sets the in-flight flag, so retry
// can always supersede it, and its failure keeps whatever is shown.
const useMe = (fetchImpl: typeof fetch = fetch) => {
  const [state, setState] = useState<MeState>({
    me: null,
    error: false,
    loading: true,
  });
  const requestId = useRef(0);
  const inFlight = useRef(false);

  const request = useCallback(
    (quiet = false) => {
      const id = ++requestId.current;
      if (!quiet) inFlight.current = true;
      apiFetch<unknown>("/me", {}, fetchImpl)
        .then((body) => {
          if (!isMe(body)) throw new Error("unexpected /api/me body");
          return { me: body, error: false, loading: false };
        })
        .catch(() => null)
        .then((next) => {
          if (id !== requestId.current) return;
          inFlight.current = false;
          const failed: MeState = { me: null, error: true, loading: false };
          // A quiet failure keeps what is shown; with nothing shown it is an error.
          setState((s) => next ?? (quiet && s.me ? s : failed));
        });
    },
    [fetchImpl],
  );

  useEffect(() => {
    const ids = requestId;
    request();
    return () => {
      ids.current++;
      inFlight.current = false;
    };
  }, [request]);

  // Another tab changed the profile: refetch quietly, keeping what is shown.
  const profileVersion = useChangeVersion("profile");
  const seenVersion = useRef(profileVersion);
  useEffect(() => {
    if (seenVersion.current === profileVersion) return;
    seenVersion.current = profileVersion;
    request(true);
  }, [profileVersion, request]);

  const retry = useCallback(() => {
    if (inFlight.current) return;
    setState((s) => ({ ...s, loading: true }));
    request();
  }, [request]);

  return { ...state, retry };
};

export default useMe;
