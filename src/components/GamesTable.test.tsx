import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import GamesTable from "@/components/GamesTable";
import { renderWithMantine } from "@/test/utils";
import type { GamesData, SelectedGame } from "@/types";

const games: SelectedGame[] = [
  { name: "Root", id: "100", score: 90, min: 0, max: 99, players: {} },
  { name: "Chess", id: "200", score: 30, min: 0, max: 99, players: {} },
];

const gameData: GamesData = { 100: { players: { min: 2, max: 4 } } };

const renderTable = (props: Partial<ComponentProps<typeof GamesTable>> = {}) =>
  renderWithMantine(
    <GamesTable
      games={games}
      selectedMax={100}
      individualMax={50}
      gameData={gameData}
      getPlayedCount={() => 0}
      onInc={() => {}}
      onDec={() => {}}
      {...props}
    />,
  );

describe("GamesTable", () => {
  it("renders a body row per game with a rank", () => {
    const { getByText, getByRole } = renderTable();

    expect(getByText("1.")).toBeInTheDocument();
    expect(getByText("2.")).toBeInTheDocument();
    expect(getByRole("link", { name: "Root" })).toBeInTheDocument();
    expect(getByRole("link", { name: "Chess" })).toBeInTheDocument();
  });

  it("passes the game id to the play-count handlers", async () => {
    const user = userEvent.setup();
    const onInc = vi.fn();
    const { getAllByRole } = renderTable({ onInc });

    // Root is the first row; its "+" is the first increment button.
    const incButtons = getAllByRole("button", { name: "+" });
    await user.click(incButtons[0]);

    expect(onInc).toHaveBeenCalledWith("100");
  });
});
