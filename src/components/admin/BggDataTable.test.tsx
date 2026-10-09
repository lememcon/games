import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import BggDataTable from "@/components/admin/BggDataTable";
import { renderWithMantine } from "@/test/utils";
import type { BggGameRow } from "@/types";

const game = (bggId: number, over: Partial<BggGameRow> = {}): BggGameRow => ({
  bggId,
  name: `Game ${bggId}`,
  years: [2025, 2026],
  state: "loaded",
  hasPlayers: true,
  hasImage: true,
  fetchedAt: null,
  ...over,
});
const games = [
  game(1, { name: "Azul" }),
  game(2, {
    name: "Wingspan",
    state: "missing",
    hasPlayers: false,
    hasImage: false,
  }),
];

const setup = (selected: number[] = [], disabled = false) => {
  const onSelectedChange = vi.fn();
  renderWithMantine(
    <BggDataTable
      games={games}
      selected={selected}
      onSelectedChange={onSelectedChange}
      disabled={disabled}
    />,
  );
  return onSelectedChange;
};

describe("BggDataTable", () => {
  it("lists games with state, years and flags", () => {
    setup();
    const row = screen.getByText("Wingspan").closest("tr")!;
    expect(within(row).getByText("2025, 2026")).toBeInTheDocument();
    expect(within(row).getByText("missing")).toBeInTheDocument();
    expect(within(row).getAllByText("no")).toHaveLength(2);
  });

  it("selects and deselects a game", async () => {
    const onChange = setup([1]);
    await userEvent.click(screen.getByLabelText("Select Wingspan"));
    expect(onChange).toHaveBeenLastCalledWith([1, 2]);
    await userEvent.click(screen.getByLabelText("Select Azul"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("selects all shown games", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByLabelText("Select all shown games"));
    expect(onChange).toHaveBeenCalledWith([1, 2]);
  });

  it("filters by name and says when nothing matches", async () => {
    const onChange = setup();
    await userEvent.type(screen.getByLabelText("Filter games"), "wing");
    expect(screen.queryByText("Azul")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Select all shown games"));
    expect(onChange).toHaveBeenCalledWith([2]);
    await userEvent.clear(screen.getByLabelText("Filter games"));
    await userEvent.type(screen.getByLabelText("Filter games"), "zzz");
    expect(screen.getByText("No games match.")).toBeInTheDocument();
    expect(screen.getByLabelText("Select all shown games")).toBeDisabled();
  });

  it("disables selection while a job runs", () => {
    setup([], true);
    expect(screen.getByLabelText("Select Azul")).toBeDisabled();
  });
});
