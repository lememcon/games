import { describe, expect, it } from "vitest";

import PlayedByList from "@/components/PlayedByList";
import { PALETTE } from "@/lib/colors";
import { PlayerColorProvider } from "@/lib/playerColors";
import { renderWithMantine } from "@/test/utils";

describe("PlayedByList", () => {
  it("renders nothing when nobody has played", () => {
    const { container } = renderWithMantine(<PlayedByList playedBy={{}} />);
    expect(container.querySelector("ul")).toBeNull();
  });

  it("shows a chip per player in their color", () => {
    const { getByText } = renderWithMantine(
      <PlayerColorProvider value={{ Ann: PALETTE[1] }}>
        <PlayedByList playedBy={{ Ann: 3, Bo: 1 }} />
      </PlayerColorProvider>,
    );

    expect(getByText("Ann ×3")).toHaveStyle({ color: PALETTE[1] });
    expect(getByText("Bo ×1")).toHaveStyle({ color: PALETTE[0] });
  });
});
