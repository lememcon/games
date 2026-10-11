import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfileVetoes from "@/components/ProfileVetoes";
import { renderWithMantine } from "@/test/utils";
import type { GamesData } from "@/types";

const vetoes = vi.hoisted(() => ({
  state: {
    vetoes: [] as { bggId: number; name: string | null }[],
    loading: false,
    saving: false,
    error: null as string | null,
    add: vi.fn(),
    clear: vi.fn(),
  },
}));
const gamesState = vi.hoisted(() => ({
  games: {} as GamesData,
}));
vi.mock("@/hooks/useMyVetoes", () => ({ default: () => vetoes.state }));
vi.mock("@/hooks/useGames", () => ({
  default: () => ({ games: gamesState.games, loading: false, error: false }),
}));

describe("ProfileVetoes", () => {
  beforeEach(() => {
    Object.assign(vetoes.state, {
      vetoes: [],
      loading: false,
      saving: false,
      error: null,
    });
    vetoes.state.add.mockReset();
    vetoes.state.clear.mockReset();
    gamesState.games = {
      "1": { name: "Root" },
      "2": { name: "Azul" },
      "3": { name: "Catan" },
    };
  });

  it("shows an empty state, but not while loading", () => {
    const { unmount } = renderWithMantine(<ProfileVetoes />);
    expect(screen.getByText("You haven't vetoed any games.")).toBeVisible();
    unmount();
    vetoes.state.loading = true;
    renderWithMantine(<ProfileVetoes />);
    expect(screen.queryByText("You haven't vetoed any games.")).toBeNull();
  });

  it("lists vetoes as plain text and undoes one", async () => {
    vetoes.state.vetoes = [
      { bggId: 2, name: "Azul" },
      { bggId: 9, name: null },
    ];
    renderWithMantine(<ProfileVetoes />);
    expect(screen.getByText("Azul")).toBeInTheDocument();
    expect(screen.getByText("Game 9")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Undo veto of Azul" }),
    );
    expect(vetoes.state.clear).toHaveBeenCalledWith(2);
  });

  it("adds a veto from the picker", async () => {
    renderWithMantine(<ProfileVetoes />);
    expect(screen.getByRole("button", { name: "Veto" })).toBeDisabled();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Game to veto" }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: "Catan", hidden: true }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Veto" }));
    expect(vetoes.state.add).toHaveBeenCalledWith(3);
  });

  it("does not offer games already vetoed", async () => {
    vetoes.state.vetoes = [{ bggId: 2, name: "Azul" }];
    renderWithMantine(<ProfileVetoes />);
    await userEvent.click(
      screen.getByRole("combobox", { name: "Game to veto" }),
    );
    expect(
      screen.getByRole("option", { name: "Catan", hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Azul", hidden: true }),
    ).toBeNull();
  });

  it("disables the controls while saving", () => {
    vetoes.state.vetoes = [{ bggId: 2, name: "Azul" }];
    vetoes.state.saving = true;
    renderWithMantine(<ProfileVetoes />);
    expect(
      screen.getByRole("combobox", { name: "Game to veto" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Veto" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Undo veto of Azul" }),
    ).toBeDisabled();
  });

  it("shows an error such as unknown_game", () => {
    vetoes.state.error = "That game no longer exists.";
    renderWithMantine(<ProfileVetoes />);
    expect(screen.getByRole("alert")).toHaveTextContent("no longer exists");
  });
});
