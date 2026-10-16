import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PageBackdrop from "@/components/PageBackdrop";

const covers = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useBackdropCovers", () => ({ default: covers }));

describe("PageBackdrop", () => {
  it("renders the hook's covers for the current path", async () => {
    window.history.pushState({}, "", "/2025");
    covers.mockReturnValue({
      pool: ["1"],
      preferred: ["1"],
      covers: { "1": "/g/1.png", "2": "/g/2.png" },
    });
    const { container } = render(<PageBackdrop />);
    await waitFor(() =>
      expect(container.querySelectorAll("img")).toHaveLength(1),
    );
    expect(covers).toHaveBeenCalledWith("/2025");
    expect(container.querySelector("img")).toHaveAttribute("src", "/g/1.png");
    window.history.pushState({}, "", "/");
  });
});
