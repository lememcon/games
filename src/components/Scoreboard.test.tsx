import { act, cleanup, screen } from "@testing-library/react";
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
  usePlayedCounts: vi.fn(),
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
  default: (year: string) => {
    state.usePlayedCounts(year);
    return [
      (id: string) => state.played[id] ?? 0,
      state.incPlayed,
      vi.fn(),
      state.played,
    ];
  },
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

const at = (path: string) => window.history.pushState({}, "", path);
const path = () => window.location.pathname;

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
    // Unmount before resetting the URL, or a mounted Scoreboard redirects.
    cleanup();
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("gives the played counts the year only once the years have loaded", () => {
    at("/2026");
    state.years = { years: [], loading: true, error: false };
    const { rerender } = render();
    expect(state.usePlayedCounts).toHaveBeenLastCalledWith("");

    state.years = { years: ["2025", "2026"], loading: false, error: false };
    rerender(
      <MantineProvider>
        <Scoreboard user={member} />
      </MantineProvider>,
    );
    expect(state.usePlayedCounts).toHaveBeenLastCalledWith("2026");
  });

  it("renders the game detail on /:year/games/:id", () => {
    at("/2025/games/11");
    const { getByRole, queryByText } = render();

    expect(getByRole("heading", { name: "Belfort" })).toBeInTheDocument();
    expect(queryByText("Filter By Players")).toBeNull();
    expect(state.useData).toHaveBeenLastCalledWith("2025");
  });

  it("renders the header and the games list", () => {
    at("/2026");
    const { getByRole, getByText } = render();

    expect(getByRole("heading", { name: "LememCon" })).toBeInTheDocument();
    expect(getByRole("link", { name: "Belfort" })).toHaveAttribute(
      "href",
      "/2026/games/11",
    );
    expect(getByText("Filter By Players")).toBeInTheDocument();
    // Belfort aggregates 50 + 30 = 80; normalized against selectedMax
    // (100 * 2 players = 200) that renders as 40.
    expect(getByText("40")).toBeInTheDocument();
  });

  it("clears the player filter and navigates when a year is picked", async () => {
    const user = userEvent.setup();
    at("/2026");
    localStorage.setItem("players", JSON.stringify(["alice"]));
    const { container } = render();

    // The year Select has id="year"; the MultiSelect also renders a textbox,
    // so target the year input directly. The default is the newest year.
    await user.click(container.querySelector("#year")!);
    await user.click(await screen.findByText("2025"));
    expect(path()).toBe("/2025");
    expect(state.useData).toHaveBeenLastCalledWith("2025");

    expect(JSON.parse(localStorage.getItem("players")!)).toEqual([]);
  });

  it("counts plays through the played counter", async () => {
    const user = userEvent.setup();
    at("/2026");
    render();

    await user.click(await screen.findByRole("button", { name: "+" }));

    expect(state.incPlayed).toHaveBeenCalledWith("11");
  });

  it("shows skeletons while the data loads", () => {
    at("/2026");
    state.data = { ...emptyData, loading: true };
    const { container, queryByText } = render();

    expect(container.querySelector(".mantine-Skeleton-root")).toBeTruthy();
    expect(queryByText("Filter By Players")).toBeNull();
  });

  it("shows an error message when the fetch fails", () => {
    at("/2026");
    state.data = { ...emptyData, error: true };
    const { getByText } = render();

    expect(getByText(/Couldn.t load the scores/)).toBeInTheDocument();
  });

  it("shows an empty message when no games are ranked", () => {
    at("/2026");
    state.data = emptyData;
    const { getByText } = render();

    expect(getByText(/Scores haven.t been posted/)).toBeInTheDocument();
  });

  it("explains when no ranked game includes the selected players", () => {
    at("/2026");
    state.data = { ...loadedData, by_player: { alice: [], bob: [] } };
    localStorage.setItem("players", JSON.stringify(["alice"]));
    const { getByText } = render();

    expect(getByText(/None of the ranked games include/)).toBeInTheDocument();
  });

  it("clears the selected players from the empty state", async () => {
    at("/2026");
    const user = userEvent.setup();
    state.data = { ...loadedData, by_player: { alice: [], bob: [] } };
    localStorage.setItem("players", JSON.stringify(["alice"]));
    const { getByRole, queryByRole } = render();

    await user.click(getByRole("button", { name: "Clear players" }));

    expect(JSON.parse(localStorage.getItem("players")!)).toEqual([]);
    expect(queryByRole("button", { name: "Clear players" })).toBeNull();
  });

  it("congratulates when every ranked game is hidden as played", () => {
    at("/2026");
    localStorage.setItem("hide_played", "true");
    state.played = { 11: 1 };
    const { getByText } = render();

    expect(getByText(/played every ranked game/)).toBeInTheDocument();
  });

  it("fetches no scores until the years are known", () => {
    at("/2026");
    state.years = { years: [], loading: true, error: false };
    state.data = { ...emptyData, loading: true };
    const { container } = render();

    expect(state.useData).toHaveBeenLastCalledWith(null);
    expect(container.querySelector(".mantine-Skeleton-root")).toBeTruthy();
  });

  it("waits for the game details", () => {
    at("/2026");
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
    at("/2026");
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

  describe("routing", () => {
    it("redirects / to the stored year", () => {
      localStorage.setItem("year", JSON.stringify("2025"));
      render();
      expect(path()).toBe("/2025");
      expect(state.useData).toHaveBeenLastCalledWith("2025");
    });

    it.each([[""], ["2019"]])(
      "redirects / to the newest year when the stored year is %j",
      (stored) => {
        if (stored) localStorage.setItem("year", JSON.stringify(stored));
        render();
        expect(path()).toBe("/2026");
      },
    );

    it("does not navigate while the years load", () => {
      state.years = { years: [], loading: true, error: false };
      at("/games/11");
      const first = render();
      expect(path()).toBe("/games/11");
      first.unmount();
      at("/abc");
      render();
      expect(path()).toBe("/abc");
    });

    it("loads the URL year regardless of the stored one and stores it", () => {
      localStorage.setItem("year", JSON.stringify("2026"));
      at("/2025");
      render();
      expect(state.useData).toHaveBeenLastCalledWith("2025");
      expect(JSON.parse(localStorage.getItem("year")!)).toBe("2025");
    });

    it("writes the stored year only when it changes, with no render loop", () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      at("/2025");
      const first = render();
      const writes = setItem.mock.calls.filter(([k]) => k === "year");
      expect(writes).toHaveLength(1);
      first.unmount();

      localStorage.setItem("year", JSON.stringify("2026"));
      setItem.mockClear();
      at("/2026");
      render();
      expect(setItem.mock.calls.filter(([k]) => k === "year")).toHaveLength(0);
      setItem.mockRestore();
    });

    it("shows an unknown-year notice without fetching or storing it", () => {
      at("/1999");
      const { getByText, getByRole } = render();

      expect(getByText("Unknown year")).toBeInTheDocument();
      expect(getByRole("link", { name: "View 2026" })).toHaveAttribute(
        "href",
        "/2026",
      );
      expect(state.useData).not.toHaveBeenCalledWith("1999");
      expect(state.useData).toHaveBeenLastCalledWith(null);
      expect(state.usePlayedCounts).toHaveBeenLastCalledWith("");
      expect(localStorage.getItem("year")).toBeNull();
      expect(path()).toBe("/1999");
    });

    it("sends a legacy /games/:id into the default year", () => {
      localStorage.setItem("year", JSON.stringify("2025"));
      at("/games/11");
      const { getByRole } = render();
      expect(path()).toBe("/2025/games/11");
      expect(getByRole("heading", { name: "Belfort" })).toBeInTheDocument();
    });

    it("treats a trailing slash like the bare year", () => {
      at("/2025/");
      render();
      expect(state.useData).toHaveBeenLastCalledWith("2025");
      expect(path()).toBe("/2025/");
    });

    it.each(["/abc", "/2025/foo", "/12345", "/admin/foo", "/profile/x"])(
      "redirects %s to the default year via /",
      (bad) => {
        at(bad);
        render();
        expect(path()).toBe("/2026");
      },
    );

    it("returns to the list when a year is picked on a game page", async () => {
      const user = userEvent.setup();
      at("/2026/games/11");
      const { container, queryByText } = render();
      expect(queryByText("Filter By Players")).toBeNull();

      await user.click(container.querySelector("#year")!);
      await user.click(await screen.findByText("2025"));
      expect(path()).toBe("/2025");
      expect(await screen.findByText("Filter By Players")).toBeInTheDocument();
    });

    it("refetches and clears stale players when the URL year changes", async () => {
      localStorage.setItem("players", JSON.stringify(["alice"]));
      at("/2026");
      const { findByText } = render();
      expect(JSON.parse(localStorage.getItem("players")!)).toEqual(["alice"]);

      act(() => {
        window.history.pushState({}, "", "/2025");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      await findByText("Filter By Players");
      expect(state.useData).toHaveBeenLastCalledWith("2025");
      expect(JSON.parse(localStorage.getItem("players")!)).toEqual([]);
    });

    it("does not clear the players when the URL year matches the stored one", () => {
      localStorage.setItem("year", JSON.stringify("2026"));
      localStorage.setItem("players", JSON.stringify(["alice"]));
      at("/2026");
      render();
      expect(JSON.parse(localStorage.getItem("players")!)).toEqual(["alice"]);
    });

    it("does not clear the players when no year is stored yet", () => {
      localStorage.setItem("players", JSON.stringify(["alice"]));
      at("/2026");
      render();
      expect(JSON.parse(localStorage.getItem("players")!)).toEqual(["alice"]);
      expect(JSON.parse(localStorage.getItem("year")!)).toBe("2026");
    });

    it("clears the players when a link opens a different year than stored", () => {
      localStorage.setItem("year", JSON.stringify("2025"));
      localStorage.setItem("players", JSON.stringify(["alice"]));
      at("/2026");
      render();
      expect(JSON.parse(localStorage.getItem("players")!)).toEqual([]);
      expect(JSON.parse(localStorage.getItem("year")!)).toBe("2026");
    });

    it("sends a legacy /games/:id to the newest year when none is stored", () => {
      at("/games/11");
      render();
      expect(path()).toBe("/2026/games/11");
    });

    it("shows the empty state for a year URL when there are no years", () => {
      state.years = { years: [], loading: false, error: false };
      at("/2026");
      const { getByText } = render();
      expect(getByText("No scores yet")).toBeInTheDocument();
    });

    it("does not trap the back button after a redirect", () => {
      at("/other");
      const before = window.history.length;
      at("/");
      render();
      expect(path()).toBe("/2026");
      // replace, not push: one entry for "/" was pushed above, none added by the redirect
      expect(window.history.length).toBe(before + 1);
    });
  });
});
