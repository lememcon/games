import { describe, expect, it } from "vitest";

import PlayerName, { PlayerColorProvider } from "@/components/PlayerName";
import { PALETTE } from "@/lib/colors";
import { renderWithMantine } from "@/test/utils";

// jsdom normalizes an inline hex color to rgb(), so compare against the rgb form.
const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

describe("PlayerName", () => {
  it("renders the name in the color the provider assigns", () => {
    const { getByText } = renderWithMantine(
      <PlayerColorProvider value={{ alice: PALETTE[2] }}>
        <PlayerName name="alice" />
      </PlayerColorProvider>,
    );
    expect(getByText("alice")).toHaveStyle({ color: rgb(PALETTE[2]) });
  });

  it("falls back to the first palette color for an unmapped name", () => {
    const { getByText } = renderWithMantine(<PlayerName name="ghost" />);
    expect(getByText("ghost")).toHaveStyle({ color: rgb(PALETTE[0]) });
  });
});
