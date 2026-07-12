import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Filters from "@/components/Filters";
import { PALETTE } from "@/lib/colors";
import { renderWithMantine } from "@/test/utils";

const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

const defaults = {
  players: [],
  playerOptions: ["alice", "bob"],
  onPlayersChange: () => {},
  hidePlayed: false,
  onHidePlayedChange: () => {},
  shown: 3,
  total: 12,
};

describe("Filters", () => {
  it("toggles hide-played through onHidePlayedChange", async () => {
    const user = userEvent.setup();
    const onHidePlayedChange = vi.fn();
    const { getByRole } = renderWithMantine(
      <Filters {...defaults} onHidePlayedChange={onHidePlayedChange} />,
    );

    await user.click(getByRole("checkbox"));

    expect(onHidePlayedChange).toHaveBeenCalledWith(true);
  });

  it("reflects the checked state", () => {
    const { getByRole } = renderWithMantine(
      <Filters {...defaults} hidePlayed={true} />,
    );

    expect(getByRole("checkbox")).toBeChecked();
  });

  it("renders a colored chip per player and forwards a pick", async () => {
    const user = userEvent.setup();
    const onPlayersChange = vi.fn();
    const { getByRole } = renderWithMantine(
      <Filters {...defaults} onPlayersChange={onPlayersChange} />,
    );

    const alice = getByRole("button", { name: "alice" });
    // playerOptions sort to alice(0), bob(1).
    expect(alice).toHaveStyle({ color: rgb(PALETTE[0]) });

    await user.click(alice);
    expect(onPlayersChange).toHaveBeenCalledWith(["alice"]);
  });

  it("shows how many games are in view of the total", () => {
    const { getByText } = renderWithMantine(<Filters {...defaults} />);
    expect(getByText("3 of 12 games")).toBeInTheDocument();
  });
});
