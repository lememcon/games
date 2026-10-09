import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import type { Data } from "@/types";

const emptyData: Data = {
  loading: false,
  scores: [],
  by_game: {},
  by_player: {},
  by_id: {},
  max: 0,
};

const loadedData: Data = {
  ...emptyData,
  by_player: {
    alice: [
      { game: "Belfort", player: "alice", rank: 1, score: 50, bgg_id: 11 },
    ],
    bob: [{ game: "Belfort", player: "bob", rank: 2, score: 30, bgg_id: 11 }],
  },
  by_id: {
    11: [
      { game: "Belfort", player: "alice", rank: 1, score: 50, bgg_id: 11 },
      { game: "Belfort", player: "bob", rank: 2, score: 30, bgg_id: 11 },
    ],
  },
  max: 100,
};

// The mocked hook reads from a hoisted holder so each test can swap in a
// different Data shape (loaded, loading, error, empty).
const state = vi.hoisted(() => ({ data: {} as Data }));
vi.mock("@/hooks/useData", () => ({ default: () => state.data }));

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    state.data = loadedData;
  });
  afterEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("renders the game detail on /games/:id", () => {
    window.history.pushState({}, "", "/games/11");
    const { getByRole, queryByText } = render(<App />);

    expect(getByRole("heading", { name: "Belfort" })).toBeInTheDocument();
    expect(queryByText("Filter By Players")).toBeNull();
  });

  it("renders the header and the games list", () => {
    const { getByRole, getByText } = render(<App />);

    expect(getByRole("heading", { name: "LememCon" })).toBeInTheDocument();
    expect(getByRole("link", { name: "Belfort" })).toHaveAttribute(
      "href",
      "/games/11",
    );
    expect(getByText("Filter By Players")).toBeInTheDocument();
    // Belfort aggregates 50 + 30 = 80; normalized against selectedMax
    // (100 * 2 players = 200) that renders as 40.
    expect(getByText("40")).toBeInTheDocument();
  });

  it("links each game row to its detail route", () => {
    const { getByRole } = render(<App />);
    expect(getByRole("link", { name: "Belfort" })).toHaveAttribute(
      "href",
      "/games/11",
    );
  });

  it("clears the player filter when the year changes", async () => {
    const user = userEvent.setup();
    localStorage.setItem("players", JSON.stringify(["alice"]));
    const { container } = render(<App />);

    // The year Select has id="year"; the MultiSelect also renders a textbox,
    // so target the year input directly. Default year is the current year.
    await user.click(container.querySelector("#year")!);
    await user.click(await screen.findByText("2025"));

    expect(JSON.parse(localStorage.getItem("players")!)).toEqual([]);
  });

  it("shows skeletons while the data loads", () => {
    state.data = { ...emptyData, loading: true };
    const { container, queryByText } = render(<App />);

    expect(container.querySelector(".mantine-Skeleton-root")).toBeTruthy();
    expect(queryByText("Filter By Players")).toBeNull();
  });

  it("shows an error message when the fetch fails", () => {
    state.data = { ...emptyData, error: true };
    const { getByText } = render(<App />);

    expect(getByText(/Couldn.t load the scores/)).toBeInTheDocument();
  });

  it("shows an empty message when no games are ranked", () => {
    state.data = emptyData;
    const { getByText } = render(<App />);

    expect(getByText(/Scores haven.t been posted/)).toBeInTheDocument();
  });

  it("explains when no ranked game includes the selected players", () => {
    state.data = { ...loadedData, by_player: { alice: [], bob: [] } };
    localStorage.setItem("players", JSON.stringify(["alice"]));
    const { getByText } = render(<App />);

    expect(getByText(/None of the ranked games include/)).toBeInTheDocument();
  });

  it("clears the selected players from the empty state", async () => {
    const user = userEvent.setup();
    state.data = { ...loadedData, by_player: { alice: [], bob: [] } };
    localStorage.setItem("players", JSON.stringify(["alice"]));
    const { getByRole, queryByRole } = render(<App />);

    await user.click(getByRole("button", { name: "Clear players" }));

    expect(JSON.parse(localStorage.getItem("players")!)).toEqual([]);
    expect(queryByRole("button", { name: "Clear players" })).toBeNull();
  });

  it("congratulates when every ranked game is hidden as played", () => {
    localStorage.setItem("hide_played", "true");
    const year = `${new Date().getFullYear()}`;
    localStorage.setItem(`played_counts_${year}`, JSON.stringify({ 11: 1 }));
    const { getByText } = render(<App />);

    expect(getByText(/played every ranked game/)).toBeInTheDocument();
  });
});
