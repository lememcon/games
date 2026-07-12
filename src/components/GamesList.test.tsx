import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import GamesList from "@/components/GamesList";
import { renderWithMantine } from "@/test/utils";
import type { GamesData, SelectedGame } from "@/types";

const games: SelectedGame[] = [
  { name: "Root", id: "100", score: 90, min: 0, max: 99, players: {} },
  { name: "Chess", id: "200", score: 80, min: 0, max: 99, players: {} },
  { name: "Go", id: "300", score: 70, min: 0, max: 99, players: {} },
  { name: "Nim", id: "400", score: 60, min: 0, max: 99, players: {} },
];

const gameData: GamesData = { 100: { players: { min: 2, max: 4 } } };

const renderList = (props: Partial<ComponentProps<typeof GamesList>> = {}) =>
  renderWithMantine(
    <GamesList
      games={games}
      selectedMax={400}
      individualMax={100}
      gameData={gameData}
      getPlayedCount={() => 0}
      onInc={() => {}}
      onDec={() => {}}
      {...props}
    />,
  );

describe("GamesList", () => {
  it("renders a link for every game", () => {
    const { getByRole } = renderList();

    for (const name of ["Root", "Chess", "Go", "Nim"]) {
      expect(getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("puts the top three on the podium and the rest in rows", () => {
    const { getByText, queryByText } = renderList();

    // Only GameCard renders the "Rank N" eyebrow.
    expect(getByText("Rank 1")).toBeInTheDocument();
    expect(getByText("Rank 3")).toBeInTheDocument();
    expect(queryByText("Rank 4")).not.toBeInTheDocument();
  });

  it("passes the game id to the play-count handlers", async () => {
    const user = userEvent.setup();
    const onInc = vi.fn();
    const { getAllByRole } = renderList({ onInc });

    await user.click(getAllByRole("button", { name: "+" })[0]);

    expect(onInc).toHaveBeenCalledWith("100");
  });

  it("wires the play-count handlers on chase rows too", async () => {
    const user = userEvent.setup();
    const onInc = vi.fn();
    const onDec = vi.fn();
    const { getAllByRole } = renderList({
      onInc,
      onDec,
      getPlayedCount: () => 2,
    });

    // Nim is the 4th game — the only chase row — so its buttons are last.
    const incs = getAllByRole("button", { name: "+" });
    const decs = getAllByRole("button", { name: "-" });
    await user.click(incs[incs.length - 1]);
    await user.click(decs[decs.length - 1]);

    expect(onInc).toHaveBeenCalledWith("400");
    expect(onDec).toHaveBeenCalledWith("400");
  });
});
