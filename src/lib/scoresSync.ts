import { useSyncExternalStore } from "react";

import { invalidateScores } from "@/lib/scoresCache";

// Tells other open tabs that an import succeeded, so they drop their cached
// scores and reload what they show. Kept apart from scoresCache, which must
// not know about it. Where BroadcastChannel is missing, a localStorage write
// under STORAGE_KEY stands in: other tabs get a "storage" event for it.
const STORAGE_KEY = "scores-import";
let channel: BroadcastChannel | null = null;
let version = 0;
let storageListening = false;
const listeners = new Set<() => void>();

const bump = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};

// Another tab or device imported: drop cached scores and refetch.
export const remoteImport = (): void => {
  invalidateScores();
  bump();
};

const onStorage = (e: StorageEvent) => {
  if (e.key === STORAGE_KEY) remoteImport();
};

// One channel per tab, opened on first use and kept for the tab's life. Any
// message means "an import happened"; no payload is read.
const getChannel = (): BroadcastChannel | null => {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(STORAGE_KEY);
    channel.onmessage = remoteImport;
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
  if (typeof BroadcastChannel === "undefined") {
    try {
      // The value must change each time, or no storage event fires.
      localStorage.setItem(STORAGE_KEY, `${Date.now()}:${Math.random()}`);
    } catch {
      // Storage unavailable; same fallback as above.
    }
  }
  bump();
};

const subscribe = (listener: () => void) => {
  getChannel();
  if (typeof BroadcastChannel === "undefined" && !storageListening) {
    window.addEventListener("storage", onStorage);
    storageListening = true;
  }
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
  window.removeEventListener("storage", onStorage);
  storageListening = false;
  version = 0;
};
