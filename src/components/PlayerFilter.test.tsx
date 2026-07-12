import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PlayerFilter from "@/components/PlayerFilter";
import { PALETTE } from "@/lib/colors";
import { renderWithMantine } from "@/test/utils";

const options = ["alice", "bob", "carol"];

const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

const renderFilter = (players: string[] = [], onPlayersChange = () => {}) =>
  renderWithMantine(
    <PlayerFilter
      players={players}
      playerOptions={options}
      onPlayersChange={onPlayersChange}
    />,
  );

describe("PlayerFilter", () => {
  it("renders a toggle button per player", () => {
    const { getByRole } = renderFilter();
    options.forEach((name) =>
      expect(getByRole("button", { name })).toBeInTheDocument(),
    );
  });

  it("adds an unselected player when clicked", async () => {
    const user = userEvent.setup();
    const onPlayersChange = vi.fn();
    const { getByRole } = renderFilter(["alice"], onPlayersChange);

    await user.click(getByRole("button", { name: "bob" }));

    expect(onPlayersChange).toHaveBeenCalledWith(["alice", "bob"]);
  });

  it("removes a selected player when clicked", async () => {
    const user = userEvent.setup();
    const onPlayersChange = vi.fn();
    const { getByRole } = renderFilter(["alice", "bob"], onPlayersChange);

    await user.click(getByRole("button", { name: "alice" }));

    expect(onPlayersChange).toHaveBeenCalledWith(["bob"]);
  });

  it("marks selected players with aria-pressed", () => {
    const { getByRole } = renderFilter(["alice"]);
    expect(getByRole("button", { name: "alice" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(getByRole("button", { name: "bob" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("colors chips by sorted position: filled when selected, tinted when not", () => {
    // options sort to alice(0), bob(1), carol(2).
    const { getByRole } = renderFilter(["alice"]);
    expect(getByRole("button", { name: "alice" })).toHaveStyle({
      background: rgb(PALETTE[0]),
      color: "rgb(255, 255, 255)",
    });
    expect(getByRole("button", { name: "bob" })).toHaveStyle({
      color: rgb(PALETTE[1]),
    });
  });

  it("clears every selection through Clear", async () => {
    const user = userEvent.setup();
    const onPlayersChange = vi.fn();
    const { getByRole } = renderFilter(["alice", "bob"], onPlayersChange);

    await user.click(getByRole("button", { name: "Clear" }));

    expect(onPlayersChange).toHaveBeenCalledWith([]);
  });

  it("hides Clear when nothing is selected", () => {
    const { queryByRole } = renderFilter();
    expect(queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("keeps Clear mounted but hidden when empty so its space is reserved", () => {
    const { getByText } = renderFilter();
    // Present in the DOM (reserving layout) but visually and a11y hidden.
    expect(getByText("Clear")).toHaveStyle({ visibility: "hidden" });
  });

  it("renders players sorted case-insensitively", () => {
    const { getAllByRole } = renderWithMantine(
      <PlayerFilter
        players={[]}
        playerOptions={["carol", "Alice", "bob"]}
        onPlayersChange={() => {}}
      />,
    );
    const names = getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["Alice", "bob", "carol"]);
  });
});
