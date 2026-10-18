import { useSyncExternalStore } from "react";

import { invalidateScores } from "@/lib/scoresCache";

// Tells other open tabs that this member changed something of their own
// (played games, vetoes, player ranges, profile), so they refetch it. Mirrors
// scoresSync. The message is the topic name. Where BroadcastChannel is missing,
// a localStorage write under STORAGE_KEY stands in: other tabs get a "storage"
// event for it, with the topic as the value's prefix.
export type ChangeTopic = "played" | "vetoes" | "overrides" | "profile";

const STORAGE_KEY = "user-changes";
const TOPICS: Record<ChangeTopic, true> = {
  played: true,
  vetoes: true,
  overrides: true,
  profile: true,
};

let channel: BroadcastChannel | null = null;
let storageListening = false;
const versions = new Map<ChangeTopic, number>();
const listeners = new Set<() => void>();

const isTopic = (value: unknown): value is ChangeTopic =>
  typeof value === "string" && Object.hasOwn(TOPICS, value);

// A name change shows in cached scores, so drop them before anyone refetches.
const receive = (topic: unknown) => {
  if (!isTopic(topic)) return;
  if (topic === "profile") invalidateScores();
  versions.set(topic, (versions.get(topic) ?? 0) + 1);
  listeners.forEach((listener) => listener());
};

const onStorage = (e: StorageEvent) => {
  if (e.key === STORAGE_KEY) receive(e.newValue?.split(":", 1)[0]);
};

const getChannel = (): BroadcastChannel | null => {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(STORAGE_KEY);
    channel.onmessage = (e) => receive(e.data);
  }
  return channel;
};

// Call after the server accepted a change. Only other tabs are told; this tab
// already shows its own change.
export const announceChange = (topic: ChangeTopic): void => {
  try {
    getChannel()?.postMessage(topic);
  } catch {
    // Other tabs just keep what they show until they reload.
  }
  if (typeof BroadcastChannel === "undefined") {
    try {
      // The value must change each time, or no storage event fires.
      localStorage.setItem(
        STORAGE_KEY,
        `${topic}:${Date.now()}:${Math.random()}`,
      );
    } catch {
      // Storage unavailable; same fallback as above.
    }
  }
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

// Changes whenever another tab announced a change to this topic.
export const useChangeVersion = (topic: ChangeTopic): number =>
  useSyncExternalStore(subscribe, () => versions.get(topic) ?? 0);

export const resetChangeSync = (): void => {
  channel?.close();
  channel = null;
  window.removeEventListener("storage", onStorage);
  storageListening = false;
  versions.clear();
};
