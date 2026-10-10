import { describe, expect, it } from "vitest";

import PlayerRange from "@/components/PlayerRange";
import { renderWithMantine } from "@/test/utils";

describe("PlayerRange", () => {
  it("shows an unrestricted range as plain text", () => {
    const { container } = renderWithMantine(
      <span data-testid="r">
        <PlayerRange bounds={{ min: 2, max: 4 }} />
      </span>,
    );
    expect(container.querySelector("[data-testid=r]")).toHaveTextContent(
      /^2-4$/,
    );
    expect(container.querySelector("s")).toBeNull();
  });

  it("shows a fixed count as one number", () => {
    const { container } = renderWithMantine(
      <span data-testid="r">
        <PlayerRange bounds={{ min: 4, max: 4 }} />
      </span>,
    );
    expect(container.querySelector("[data-testid=r]")).toHaveTextContent(/^4$/);
  });

  it("strikes through the original and explains it", () => {
    const { container, getByText } = renderWithMantine(
      <PlayerRange bounds={{ min: 4, max: 4 }} original={{ min: 2, max: 6 }} />,
    );
    expect(container.querySelector("s")).toHaveTextContent("2-6");
    expect(container.querySelector(".player-range")).not.toHaveAttribute(
      "title",
    );
    expect(getByText("(restricted from 2-6)")).toBeInTheDocument();
  });
});
