import { vi } from "vitest";

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
