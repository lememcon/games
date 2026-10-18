// Polls a tiny public version endpoint so a tab learns about an import done on
// another device. The first response is only a baseline; a later, different
// value calls onChange. The last-seen value survives hidden periods, so an
// import while hidden fires exactly once when the tab becomes visible.
const POLL_MS = 45_000;

interface ImportFeedOptions {
  fetchVersion: () => Promise<string>;
  onChange: () => void;
}

export const startImportFeed = ({
  fetchVersion,
  onChange,
}: ImportFeedOptions): (() => void) => {
  let last: string | null = null;
  let inFlight = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const visible = () => document.visibilityState === "visible";

  const poll = async () => {
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      const version = await fetchVersion();
      if (stopped) return;
      if (last !== null && version !== last) onChange();
      last = version;
    } catch {
      // Retried on the next tick.
    } finally {
      inFlight = false;
    }
  };

  const stopTimer = () => {
    clearInterval(timer);
    timer = undefined;
  };
  const startTimer = () => {
    if (timer === undefined) timer = setInterval(() => void poll(), POLL_MS);
  };

  const onVisibility = () => {
    if (visible()) {
      startTimer();
      void poll();
    } else stopTimer();
  };
  const onFocus = () => {
    if (visible()) void poll();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);
  if (visible()) startTimer();
  void poll();

  return () => {
    stopped = true;
    stopTimer();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);
  };
};
