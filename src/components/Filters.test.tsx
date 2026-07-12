import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Filters from "@/components/Filters";
import { renderWithMantine } from "@/test/utils";

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

  it("shows how many games are in view of the total", () => {
    const { getByText } = renderWithMantine(<Filters {...defaults} />);
    expect(getByText("3 of 12 games")).toBeInTheDocument();
  });
});
