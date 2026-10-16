import { useSyncExternalStore } from "react";

import { invalidateScores } from "@/lib/scoresCache";

// Tells other open tabs that an import succeeded, so they drop their cached
// scores and reload what they show. Kept apart from scoresCache, which must
// not know about it.
let channel: BroadcastChannel | null = null;
let version = 0;
const listeners = new Set<() => void>();

const bump = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};

// One channel per tab, opened on first use and kept for the tab's life. Any
// message means "an import happened"; no payload is read.
const getChannel = (): BroadcastChannel | null => {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel("scores-import");
    channel.onmessage = () => {
      invalidateScores();
      bump();
    };
  }
  return channel;
};

// Call after a successful import. A channel never receives its own posts, so
// this tab's subscribers are notified directly.
export const announceImport = (): void => {
  try {
    getChannel()?.postMessage("import");
  } catch {
    // Other tabs just keep their cache until it expires.
  }
  bump();
};

const subscribe = (listener: () => void) => {
  getChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getVersion = () => version;

// Changes whenever an import succeeded in this or another tab.
export const useImportVersion = (): number =>
  useSyncExternalStore(subscribe, getVersion);

export const resetScoresSync = (): void => {
  channel?.close();
  channel = null;
  version = 0;
};
