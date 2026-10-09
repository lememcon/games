import { useCallback, useEffect, useState } from "react";

import { readAuthError, stripAuthError } from "@/lib/authError";

// Captures an OAuth `?error=` code from the URL on first render, then removes
// it (and `error_description`) so a reload doesn't show it again.
const useAuthError = () => {
  const [code, setCode] = useState<string | null>(() =>
    readAuthError(window.location.search),
  );

  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const clean = stripAuthError({ pathname, search, hash });
    if (clean !== `${pathname}${search}${hash}`)
      window.history.replaceState(window.history.state, "", clean);
  }, []);

  const dismiss = useCallback(() => setCode(null), []);
  return { code, dismiss };
};

export default useAuthError;
