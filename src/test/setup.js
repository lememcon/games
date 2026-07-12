import { vi } from "vitest";

import "@testing-library/jest-dom/vitest";

// Mantine reads window.matchMedia (color scheme, responsive styles) which jsdom
// does not implement.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query) => ({
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
