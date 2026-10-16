import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProfileYearVetoes from "@/components/ProfileYearVetoes";
import type { GamesState } from "@/hooks/useGames";
import { renderWithMantine } from "@/test/utils";

vi.mock("@/lib/images", () => ({
  default: { "/src/assets/games/7.jpg": "/bundled/7.jpg" },
}));

const hook = vi.hoisted(() => ({
  state: {
    vetoes: [] as {
      year: number;
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
  years: { years: ["2023", "2024"], loading: false, error: false },
}));
vi.mock("@/hooks/useMyYearVetoes", () => ({ default: () => hook.state }));
vi.mock("@/hooks/useYears", () => ({ default: () => hook.years }));

const meta = (name: string, cover?: string) => ({
  name,
  players: { min: 1, max: 4 },
  image: null,
  ...(cover ? { cover } : {}),
});
const games: GamesState = {
  games: { "1": meta("Brass"), "2": meta("Wingspan"), "3": meta("Root") },
  loading: false,
  error: false,
};
const renderIt = (g: GamesState = games) =>
  renderWithMantine(<ProfileYearVetoes games={g} />);

const gameBox = () =>
  screen.getByRole("combobox", { name: "Game for a one-year veto" });
const yearBox = () =>
  screen.getByRole("combobox", { name: "Year for the veto" });
const pick = async (name: string) => {
  await userEvent.click(gameBox());
  await userEvent.click(screen.getByRole("option", { name, hidden: true }));
};

describe("ProfileYearVetoes", () => {
  beforeEach(() => {
    Object.assign(hook.state, {
      vetoes: [],
      loading: false,
      saving: false,
      error: null,
    });
    hook.state.add.mockReset().mockResolvedValue(true);
    hook.state.clear.mockReset();
    Object.assign(hook.years, {
      years: ["2023", "2024"],
      loading: false,
      error: false,
    });
    vi.useRealTimers();
  });

  describe("add form", () => {
    afterEach(() => vi.useRealTimers());

    it("defaults to the latest year when this year has no data", () => {
      renderIt();
      expect(yearBox()).toHaveValue("2024");
    });

    it("defaults to the current year when it has data", () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2023-06-01") });
      renderIt();
      expect(yearBox()).toHaveValue("2023");
    });

    it("has no year and cannot veto when there are no years", async () => {
      hook.years.years = [];
      renderIt();
      expect(yearBox()).toHaveValue("");
      await pick("Brass");
      expect(screen.getByRole("button", { name: "Veto" })).toBeDisabled();
    });

    it("disables Veto until a game is picked", async () => {
      renderIt();
      expect(screen.getByRole("button", { name: "Veto" })).toBeDisabled();
      await pick("Brass");
      expect(screen.getByRole("button", { name: "Veto" })).toBeEnabled();
    });

    it("hides games already vetoed in the chosen year only", async () => {
      hook.state.vetoes = [
        { year: 2024, bggId: 1, name: "Brass" },
        { year: 2023, bggId: 2, name: "Wingspan" },
      ];
      renderIt();
      await userEvent.click(gameBox());
      expect(
        screen.queryByRole("option", { name: "Brass", hidden: true }),
      ).toBeNull();
      expect(
        screen.getByRole("option", { name: "Wingspan", hidden: true }),
      ).toBeInTheDocument();
      await userEvent.click(yearBox());
      await userEvent.click(
        screen.getByRole("option", { name: "2023", hidden: true }),
      );
      await userEvent.click(gameBox());
      expect(
        screen.getByRole("option", { name: "Brass", hidden: true }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Wingspan", hidden: true }),
      ).toBeNull();
    });

    it("clears the picked game when the year changes", async () => {
      renderIt();
      await pick("Brass");
      expect(gameBox()).toHaveValue("Brass");
      await userEvent.click(yearBox());
      await userEvent.click(
        screen.getByRole("option", { name: "2023", hidden: true }),
      );
      expect(gameBox()).toHaveValue("");
      expect(yearBox()).toHaveValue("2023");
    });

    it("adds the veto and clears the game but keeps the year", async () => {
      renderIt();
      await pick("Brass");
      await userEvent.click(screen.getByRole("button", { name: "Veto" }));
      expect(hook.state.add).toHaveBeenCalledWith(2024, 1);
      await waitFor(() => expect(gameBox()).toHaveValue(""));
      expect(yearBox()).toHaveValue("2024");
    });

    it("keeps the selection when the add fails", async () => {
      hook.state.add.mockResolvedValue(false);
      renderIt();
      await pick("Brass");
      await userEvent.click(screen.getByRole("button", { name: "Veto" }));
      expect(gameBox()).toHaveValue("Brass");
    });

    it("disables the pickers while saving", () => {
      hook.state.saving = true;
      renderIt();
      expect(gameBox()).toBeDisabled();
      expect(yearBox()).toBeDisabled();
    });

    it("disables the game picker and alerts when games fail to load", () => {
      renderIt({ ...games, error: true });
      expect(gameBox()).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn't load the game list.",
      );
    });

    it("disables the year picker and alerts when years fail to load", () => {
      hook.years.error = true;
      hook.years.years = [];
      renderIt();
      expect(yearBox()).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn't load the years.",
      );
    });
  });

  it("explains the scope of a year veto", () => {
    renderIt();
    expect(screen.getByText(/for that year only/)).toBeVisible();
  });

  it("shows an empty state, but not while loading", () => {
    const { unmount } = renderIt();
    expect(
      screen.getByText("You haven't vetoed any games for a single year."),
    ).toBeVisible();
    unmount();
    hook.state.loading = true;
    renderIt();
    expect(screen.queryByText(/haven't vetoed/)).toBeNull();
  });

  it("groups by year, newest first, and undoes one for its year", async () => {
    hook.state.vetoes = [
      { year: 2026, bggId: 1, name: "Brass" },
      { year: 2026, bggId: 9, name: null },
      { year: 2025, bggId: 2, name: "Wingspan" },
    ];
    renderIt();
    expect(
      screen
        .getAllByRole("heading", { name: /^Vetoed in / })
        .map((h) => h.textContent),
    ).toEqual(["Vetoed in 2026", "Vetoed in 2025"]);
    expect(screen.getByText("Game 9")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Undo 2025 veto of Wingspan" }),
    );
    expect(hook.state.clear).toHaveBeenCalledWith(2025, 2);
    expect(screen.getByRole("link", { name: "Wingspan" })).toHaveAttribute(
      "href",
      "/2025/games/2",
    );
    expect(screen.getByRole("link", { name: "Game 9" })).toHaveAttribute(
      "href",
      "/2026/games/9",
    );
    expect(
      screen.getByRole("button", { name: "Undo 2026 veto of Game 9" }),
    ).toBeInTheDocument();
  });

  it("shows a thumbnail for a veto with an image", () => {
    hook.state.vetoes = [
      {
        year: 2026,
        bggId: 1,
        name: "Brass",
        image: "https://example.com/brass.jpg",
      },
    ];
    const { container } = renderIt();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/brass.jpg",
    );
  });

  it("prefers the mirrored cover from the games data", () => {
    hook.state.vetoes = [
      {
        year: 2026,
        bggId: 7,
        name: "Azul",
        image: "https://example.com/a.jpg",
        ext: ".jpg",
      },
    ];
    const { container } = renderIt({
      ...games,
      games: { "7": meta("Azul", "https://cdn.example.com/7.webp") },
    });
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.example.com/7.webp",
    );
  });

  it("prefers the bundled cover when the veto has an ext", () => {
    hook.state.vetoes = [
      {
        year: 2026,
        bggId: 7,
        name: "Azul",
        image: "https://example.com/a.jpg",
        ext: ".jpg",
      },
    ];
    const { container } = renderIt();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/bundled/7.jpg",
    );
  });

  it("disables undo while saving", () => {
    hook.state.vetoes = [{ year: 2026, bggId: 1, name: "Brass" }];
    hook.state.saving = true;
    renderIt();
    expect(
      screen.getByRole("button", { name: "Undo 2026 veto of Brass" }),
    ).toBeDisabled();
  });

  it("shows an error", () => {
    hook.state.error = "Something went wrong.";
    renderIt();
    expect(screen.getByRole("alert")).toHaveTextContent("went wrong");
  });
});
