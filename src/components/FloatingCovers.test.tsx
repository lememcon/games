import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import FloatingCovers from "@/components/FloatingCovers";

const images = vi.hoisted(() => ({
  current: {} as Record<string, string>,
}));
vi.mock("@/lib/images", () => ({
  get default() {
    return images.current;
  },
}));

describe("FloatingCovers", () => {
  it("renders decorative lazy images after mount", async () => {
    images.current = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`/g${i}.png`, `/g${i}.png`]),
    );
    const { container } = render(<FloatingCovers />);
    expect(container.querySelector(".floaters")).toBeNull();
    await waitFor(() =>
      expect(container.querySelector(".floaters")).not.toBeNull(),
    );
    const layer = container.querySelector(".floaters");
    expect(layer).toHaveAttribute("aria-hidden", "true");
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(10);
    imgs.forEach((img) => {
      expect(img).toHaveAttribute("alt", "");
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img.style.getPropertyValue("--size")).toMatch(/px$/);
    });
  });

  it("renders an empty layer when there are no images", async () => {
    images.current = {};
    const { container } = render(<FloatingCovers />);
    await waitFor(() =>
      expect(container.querySelector(".floaters")).toBeEmptyDOMElement(),
    );
  });
});
