import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MantineProvider } from "@mantine/core";

import Scoreboard from "@/components/Scoreboard";
import { renderWithMantine } from "@/test/utils";
import type { ApprovedUser, Data, GamesData } from "@/types";

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

// The mocked hooks read from a hoisted holder so each test can swap in a
// different shape (loaded, loading, error, empty).
const state = vi.hoisted(() => ({
  data: {} as Data,
  years: {} as { years: string[]; loading: boolean; error: boolean },
  games: {} as { games: GamesData; loading: boolean; error: boolean },
  useData: vi.fn(),
  played: {} as Record<string, number>,
  incPlayed: vi.fn(),
}));
vi.mock("@/hooks/useData", () => ({
  default: (year: string | null) => {
    state.useData(year);
    return state.data;
  },
}));
vi.mock("@/hooks/useYears", () => ({ default: () => state.years }));
vi.mock("@/hooks/useGames", () => ({ default: () => state.games }));
vi.mock("@/hooks/usePlayedCounts", () => ({
  default: () => [
    (id: string) => state.played[id] ?? 0,
    state.incPlayed,
    vi.fn(),
    state.played,
  ],
}));

const member: ApprovedUser = {
  discordId: "1",
  name: "Sam",
  displayName: null,
  discordName: "Sam",
  image: null,
  role: "member",
};
const admin: ApprovedUser = { ...member, role: "admin" };

const render = (user: ApprovedUser = member) =>
  renderWithMantine(<Scoreboard user={user} />);

describe("Scoreboard", () => {
  beforeEach(() => {
    localStorage.clear();
    state.data = loadedData;
    state.years = { years: ["2025", "2026"], loading: false, error: false };
    state.games = { games: {}, loading: false, error: false };
    state.played = {};
  });
  afterEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("renders the game detail on /games/:id", () => {
    window.history.pushState({}, "", "/games/11");
    const { getByRole, queryByText } = render();

    expect(getByRole("heading", { name: "Belfort" })).toBeInTheDocument();
    expect(queryByText("Filter By Players")).toBeNull();
  });

  it("renders the header and the games list", () => {
    const { getByRole, getByText } = render();

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
    const { getByRole } = render();
    expect(getByRole("link", { name: "Belfort" })).toHaveAttribute(
      "href",
      "/games/11",
    );
  });

  it("clears the player filter when the year changes", async () => {
    const user = userEvent.setup();
    localStorage.setItem("players", JSON.stringify(["alice"]));
    const { container } = render();

    // The year Select has id="year"; the MultiSelect also renders a textbox,
    // so target the year input directly. The default is the newest year.
    await user.click(container.querySelector("#year")!);
    await user.click(await screen.findByText("2025"));
    expect(state.useData).toHaveBeenLastCalledWith("2025");

    expect(JSON.parse(localStorage.getItem("players")!)).toEqual([]);
  });

  it("counts plays through the played counter", async () => {
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "+" }));

    expect(state.incPlayed).toHaveBeenCalledWith("11");
  });

  it("shows skeletons while the data loads", () => {
    state.data = { ...emptyData, loading: true };
    const { container, queryByText } = render();

    expect(container.querySelector(".mantine-Skeleton-root")).toBeTruthy();
    expect(queryByText("Filter By Players")).toBeNull();
  });

  it("shows an error message when the fetch fails", () => {
    state.data = { ...emptyData, error: true };
    const { getByText } = render();

    expect(getByText(/Couldn.t load the scores/)).toBeInTheDocument();
  });

  it("shows an empty message when no games are ranked", () => {
    state.data = emptyData;
    const { getByText } = render();

    expect(getByText(/Scores haven.t been posted/)).toBeInTheDocument();
  });

  it("explains when no ranked game includes the selected players", () => {
    state.data = { ...loadedData, by_player: { alice: [], bob: [] } };
    localStorage.setItem("players", JSON.stringify(["alice"]));
    const { getByText } = render();

    expect(getByText(/None of the ranked games include/)).toBeInTheDocument();
  });

  it("clears the selected players from the empty state", async () => {
    const user = userEvent.setup();
    state.data = { ...loadedData, by_player: { alice: [], bob: [] } };
    localStorage.setItem("players", JSON.stringify(["alice"]));
    const { getByRole, queryByRole } = render();

    await user.click(getByRole("button", { name: "Clear players" }));

    expect(JSON.parse(localStorage.getItem("players")!)).toEqual([]);
    expect(queryByRole("button", { name: "Clear players" })).toBeNull();
  });

  it("congratulates when every ranked game is hidden as played", () => {
    localStorage.setItem("hide_played", "true");
    state.played = { 11: 1 };
    const { getByText } = render();

    expect(getByText(/played every ranked game/)).toBeInTheDocument();
  });

  it("uses the newest year when none is stored", () => {
    render();
    expect(state.useData).toHaveBeenLastCalledWith("2026");
  });

  it("uses a stored year that is in the list (compared as a string)", () => {
    localStorage.setItem("year", JSON.stringify("2025"));
    render();
    expect(state.useData).toHaveBeenLastCalledWith("2025");
  });

  it("falls back to the newest year when the stored one has no scores", () => {
    localStorage.setItem("year", JSON.stringify("2019"));
    render();
    expect(state.useData).toHaveBeenLastCalledWith("2026");
  });

  it("fetches no scores until the years are known", () => {
    state.years = { years: [], loading: true, error: false };
    state.data = { ...emptyData, loading: true };
    const { container } = render();

    expect(state.useData).toHaveBeenLastCalledWith(null);
    expect(container.querySelector(".mantine-Skeleton-root")).toBeTruthy();
  });

  it("waits for the game details", () => {
    state.games = { games: {}, loading: true, error: false };
    const { container } = render();
    expect(container.querySelector(".mantine-Skeleton-root")).toBeTruthy();
  });

  it("shows an error when the years fail to load", () => {
    state.years = { years: [], loading: false, error: true };
    const { getByText } = render();
    expect(getByText(/Couldn.t load the years/)).toBeInTheDocument();
    expect(state.useData).toHaveBeenLastCalledWith(null);
  });

  it("shows a separate error when the game details fail to load", () => {
    state.games = { games: {}, loading: false, error: true };
    const { getByText, queryByText } = render();
    expect(getByText(/Couldn.t load the game details/)).toBeInTheDocument();
    expect(queryByText(/Couldn.t load the scores/)).toBeNull();
  });

  it("shows an empty state when there are no years", () => {
    state.years = { years: [], loading: false, error: false };
    state.data = { ...emptyData, loading: true };
    const { getByText, queryByRole } = render();

    expect(getByText("No scores yet")).toBeInTheDocument();
    expect(queryByRole("link", { name: "Import scores" })).toBeNull();
  });

  it("links admins from the empty state to the import page", () => {
    state.years = { years: [], loading: false, error: false };
    state.data = { ...emptyData, loading: true };
    const { getByRole } = render(admin);

    expect(getByRole("link", { name: "Import scores" })).toHaveAttribute(
      "href",
      "/admin/import",
    );
  });
});
