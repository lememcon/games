import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MantineProvider } from "@mantine/core";

import ProfilePlayed from "@/components/ProfilePlayed";
import { renderWithMantine } from "@/test/utils";
import type { PlayerGameScore } from "@/types";

const state = vi.hoisted(() => ({
  years: { years: [] as string[], loading: false, error: false },
  data: {
    loading: false,
    error: false as boolean | undefined,
    scores: [] as PlayerGameScore[],
  },
  counts: null as Record<string, 1> | null,
  toggle: vi.fn(),
  dataYear: vi.fn(),
  countsYear: vi.fn(),
}));
vi.mock("@/hooks/useYears", () => ({ default: () => state.years }));
vi.mock("@/hooks/useData", () => ({
  default: (year: string | null) => {
    state.dataYear(year);
    return state.data;
  },
}));
vi.mock("@/hooks/usePlayedCounts", () => ({
  default: (year: string) => {
    state.countsYear(year);
    return [(id: string) => !!state.counts?.[id], state.toggle, state.counts];
  },
}));

const row = (bgg_id: number, game: string) =>
  ({ bgg_id, game, player: "p", score: 1, rank: 1 }) as PlayerGameScore;

const thisYear = String(new Date().getFullYear());

describe("ProfilePlayed", () => {
  beforeEach(() => {
    state.years = { years: ["2020", thisYear], loading: false, error: false };
    state.data = {
      loading: false,
      error: false,
      scores: [row(1, "Root"), row(2, "Azul"), row(3, "Catan")],
    };
    state.counts = { "2": 1 };
    state.toggle.mockReset();
    state.dataYear.mockReset();
    state.countsYear.mockReset();
  });

  it("defaults to the current year and lists played games", () => {
    renderWithMantine(<ProfilePlayed />);
    expect(screen.getByRole("combobox", { name: "Year" })).toHaveValue(
      thisYear,
    );
    expect(state.countsYear).toHaveBeenLastCalledWith(thisYear);
    expect(state.dataYear).toHaveBeenLastCalledWith(thisYear);
    expect(screen.getByText("Azul")).toBeInTheDocument();
  });

  it("removes a played game", async () => {
    renderWithMantine(<ProfilePlayed />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Azul" }));
    expect(state.toggle).toHaveBeenCalledWith("2");
  });

  it("adds an unplayed game and offers no played ones", async () => {
    renderWithMantine(<ProfilePlayed />);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Game to add" }),
    );
    expect(
      screen.queryByRole("option", { name: "Azul", hidden: true }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("option", { name: "Catan", hidden: true }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(state.toggle).toHaveBeenCalledWith("3");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("passes a chosen year to the hooks and keeps it on a refetch", async () => {
    const { rerender } = renderWithMantine(<ProfilePlayed />);
    await userEvent.click(screen.getByRole("combobox", { name: "Year" }));
    await userEvent.click(
      screen.getByRole("option", { name: "2020", hidden: true }),
    );
    expect(state.countsYear).toHaveBeenLastCalledWith("2020");
    expect(state.dataYear).toHaveBeenLastCalledWith("2020");
    state.years = { ...state.years, years: ["2020", thisYear] };
    rerender(
      <MantineProvider>
        <ProfilePlayed />
      </MantineProvider>,
    );
    expect(state.countsYear).toHaveBeenLastCalledWith("2020");
  });

  it("clears the game to add when the year changes", async () => {
    renderWithMantine(<ProfilePlayed />);
    await userEvent.click(
      screen.getByRole("combobox", { name: "Game to add" }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: "Catan", hidden: true }),
    );
    expect(screen.getByRole("combobox", { name: "Game to add" })).toHaveValue(
      "Catan",
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Year" }));
    await userEvent.click(
      screen.getByRole("option", { name: "2020", hidden: true }),
    );
    expect(screen.getByRole("combobox", { name: "Game to add" })).toHaveValue(
      "",
    );
  });

  it("shows loading years and no years", () => {
    state.years = { years: [], loading: true, error: false };
    const { unmount } = renderWithMantine(<ProfilePlayed />);
    expect(screen.queryByText("No years yet.")).toBeNull();
    unmount();
    state.years = { years: [], loading: false, error: false };
    renderWithMantine(<ProfilePlayed />);
    expect(screen.getByText("No years yet.")).toBeVisible();
    expect(state.countsYear).toHaveBeenLastCalledWith("");
    expect(state.dataYear).toHaveBeenLastCalledWith(null);
  });

  it("shows an empty state", () => {
    state.counts = {};
    renderWithMantine(<ProfilePlayed />);
    expect(
      screen.getByText("You haven't marked any games this year."),
    ).toBeVisible();
  });

  it("disables Add while games load", () => {
    state.data = { loading: true, error: false, scores: [] };
    renderWithMantine(<ProfilePlayed />);
    expect(screen.getByLabelText("Loading games")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Game to add" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("shows an error when games fail to load", () => {
    state.data = { loading: false, error: true, scores: [] };
    renderWithMantine(<ProfilePlayed />);
    expect(screen.getByText("Couldn't load games.")).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Game to add" }),
    ).toBeDisabled();
  });

  it("waits for played counts", () => {
    state.counts = null;
    renderWithMantine(<ProfilePlayed />);
    expect(screen.getByText("Loading played games...")).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Game to add" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });
});
