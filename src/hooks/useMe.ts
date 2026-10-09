import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { Me } from "@/types";

const isMe = (body: unknown): body is Me => {
  if (typeof body !== "object" || body === null) return false;
  const { status, user } = body as { status?: unknown; user?: unknown };
  if (status === "anonymous") return true;
  return (
    (status === "pending" || status === "approved") &&
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
// flight. Responses from superseded requests are dropped.
const useMe = (fetchImpl: typeof fetch = fetch) => {
  const [state, setState] = useState<MeState>({
    me: null,
    error: false,
    loading: true,
  });
  const requestId = useRef(0);
  const inFlight = useRef(false);

  const request = useCallback(() => {
    const id = ++requestId.current;
    inFlight.current = true;
    apiFetch<unknown>("/me", {}, fetchImpl)
      .then((body) => {
        if (!isMe(body)) throw new Error("unexpected /api/me body");
        return { me: body, error: false, loading: false };
      })
      .catch(() => ({ me: null, error: true, loading: false }))
      .then((next) => {
        if (id !== requestId.current) return;
        inFlight.current = false;
        setState(next);
      });
  }, [fetchImpl]);

  useEffect(() => {
    const ids = requestId;
    request();
    return () => {
      ids.current++;
      inFlight.current = false;
    };
  }, [request]);

  const retry = useCallback(() => {
    if (inFlight.current) return;
    setState((s) => ({ ...s, loading: true }));
    request();
  }, [request]);

  return { ...state, retry };
};

export default useMe;
