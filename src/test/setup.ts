import { beforeEach, vi } from "vitest";

import { resetChangeSync } from "@/lib/changeSync";
import { resetScoresCache } from "@/lib/scoresCache";
import { resetScoresSync } from "@/lib/scoresSync";

import "@testing-library/jest-dom/vitest";

// Mantine reads window.matchMedia (color scheme, responsive styles) which jsdom
// does not implement.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// Mantine's popover-based inputs (MultiSelect) use ResizeObserver, also absent
// from jsdom.
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mantine's Combobox scrolls the active option into view; jsdom has no layout
// so scrollIntoView is undefined.
window.Element.prototype.scrollIntoView = vi.fn();

// Node 22 has a real BroadcastChannel that crosses threads; tests get an
// in-process fake that records instances and posts, and delivers nothing.
export class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  posted: unknown[] = [];
  closed = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  close() {
    this.closed = true;
  }
}
export const channelByName = (name: string) =>
  FakeBroadcastChannel.instances.find((c) => c.name === name)!;
vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);

// Scores are cached per year at module level, and the import channel is a
// module singleton; start every test clean.
beforeEach(() => {
  FakeBroadcastChannel.instances = [];
  resetScoresCache();
  resetScoresSync();
  resetChangeSync();
});
