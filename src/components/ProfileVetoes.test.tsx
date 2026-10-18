import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfileVetoes from "@/components/ProfileVetoes";
import { renderWithMantine } from "@/test/utils";
import type { GamesData } from "@/types";

vi.mock("@/lib/images", () => ({
  default: { "/src/assets/games/7.jpg": "/bundled/7.jpg" },
}));

const vetoes = vi.hoisted(() => ({
  state: {
    vetoes: [] as {
      bggId: number;
      name: string | null;
      image?: string | null;
      ext?: string | null;
    }[],
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

const render = (error = false) =>
  renderWithMantine(
    <ProfileVetoes
      games={{ games: gamesState.games, loading: false, error }}
    />,
  );

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
    const { unmount } = render();
    expect(screen.getByText("You haven't vetoed any games.")).toBeVisible();
    unmount();
    vetoes.state.loading = true;
    render();
    expect(screen.queryByText("You haven't vetoed any games.")).toBeNull();
  });

  it("shows a thumbnail for a veto with an image", () => {
    vetoes.state.vetoes = [
      { bggId: 2, name: "Azul", image: "https://example.com/azul.jpg" },
    ];
    const { container } = render();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/azul.jpg",
    );
  });

  it("prefers the mirrored cover from the games data", () => {
    gamesState.games = {
      "7": {
        name: "Azul",
        players: { min: 1, max: 4 },
        image: null,
        cover: "https://cdn.example.com/7.webp",
      },
    };
    vetoes.state.vetoes = [
      {
        bggId: 7,
        name: "Azul",
        image: "https://example.com/a.jpg",
        ext: ".jpg",
      },
    ];
    const { container } = render();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.example.com/7.webp",
    );
  });

  it("prefers the bundled cover when the veto has an ext", () => {
    vetoes.state.vetoes = [
      {
        bggId: 7,
        name: "Azul",
        image: "https://example.com/a.jpg",
        ext: ".jpg",
      },
    ];
    const { container } = render();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/bundled/7.jpg",
    );
  });

  it("lists vetoes as plain text and undoes one", async () => {
    vetoes.state.vetoes = [
      { bggId: 2, name: "Azul" },
      { bggId: 9, name: null },
    ];
    render();
    expect(screen.getByText("Azul")).toBeInTheDocument();
    expect(screen.getByText("Game 9")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Azul" })).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Undo veto of Azul" }),
    );
    expect(vetoes.state.clear).toHaveBeenCalledWith(2);
  });

  it("adds a veto from the picker", async () => {
    render();
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
    render();
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
    render();
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
    render();
    expect(screen.getByRole("alert")).toHaveTextContent("no longer exists");
  });

  it("shows a load error and disables the picker when games fail", () => {
    gamesState.games = {};
    render(true);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load the game list.",
    );
    expect(
      screen.getByRole("combobox", { name: "Game to veto" }),
    ).toBeDisabled();
  });

  it("shows no alert when games load fine", () => {
    render();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows both the games error and the veto error", () => {
    vetoes.state.error = "That game no longer exists.";
    render(true);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
