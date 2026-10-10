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
  // The member's own counts as the hook returns them; null means not loaded.
  own: {} as Record<string, number> | null,
  allPlayed: {} as Record<string, Record<string, number>>,
  useAllPlayedCounts: vi.fn(),
  incPlayed: vi.fn(),
  usePlayedCounts: vi.fn(),
  // Everyone's own player count ranges, by discord id then bgg id.
  ranges: {} as Record<string, Record<string, { min: number; max: number }>>,
  savePlayerRange: vi.fn(),
}));
vi.mock("@/hooks/useData", () => ({
  default: (year: string | null) => {
    state.useData(year);
    return state.data;
  },
}));
vi.mock("@/hooks/useYearTotals", () => ({
  default: () => ({ totals: [], loading: false, error: false }),
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
      state.own,
    ];
  },
}));

vi.mock("@/hooks/usePlayerOverrides", () => ({
  default: () => ({
    all: state.ranges,
    saving: false,
    error: null,
    save: state.savePlayerRange,
    reset: vi.fn(),
  }),
}));

vi.mock("@/hooks/useAllPlayedCounts", () => ({
  default: (year: string) => {
    state.useAllPlayedCounts(year);
    return state.allPlayed;
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
    state.own = {};
    state.allPlayed = {};
    state.ranges = {};
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

  describe("shareable filters", () => {
    const search = () => window.location.search;
    const stored = (key: string) => JSON.parse(localStorage.getItem(key)!);

    it("lets the URL override the saved filters", () => {
      at("/2026?players=alice&hidePlayed=1");
      localStorage.setItem("players", JSON.stringify(["bob"]));
      render();

      expect(stored("players")).toEqual(["alice"]);
      expect(stored("hide_played")).toBe(true);
      expect(search()).toBe("?players=alice&hidePlayed=1");
    });

    it("drops unknown names and normalises the URL", () => {
      at("/2026?players=alice,zed");
      render();

      expect(stored("players")).toEqual(["alice"]);
      expect(search()).toBe("?players=alice");
    });

    it("drops inherited object keys without crashing", () => {
      at("/2026?players=constructor,alice");
      render();

      expect(stored("players")).toEqual(["alice"]);
      expect(search()).toBe("?players=alice");
    });

    it("keeps shared players when the year differs from the stored one", () => {
      at("/2026?players=alice");
      localStorage.setItem("year", JSON.stringify("2025"));
      render();

      expect(stored("players")).toEqual(["alice"]);
      expect(stored("year")).toBe("2026");
    });

    it("uses the saved filters for a bare year", () => {
      at("/2026");
      localStorage.setItem("players", JSON.stringify(["alice"]));
      render();

      expect(stored("players")).toEqual(["alice"]);
      expect(search()).toBe("?players=alice");
    });

    it("updates the query without adding history entries", async () => {
      const user = userEvent.setup();
      at("/2026");
      const length = window.history.length;
      const { getByRole } = render();

      await user.click(getByRole("button", { name: "alice" }));
      expect(search()).toBe("?players=alice");

      await user.click(getByRole("checkbox"));
      expect(search()).toBe("?players=alice&hidePlayed=1");
      expect(window.history.length).toBe(length);

      await user.click(getByRole("button", { name: "alice" }));
      await user.click(getByRole("checkbox"));
      expect(search()).toBe("");
    });

    it("clears players but keeps hide-played when a year is picked", async () => {
      const user = userEvent.setup();
      at("/2026?players=alice&hidePlayed=1");
      const { container } = render();

      await user.click(container.querySelector("#year")!);
      await user.click(await screen.findByText("2025"));

      expect(path()).toBe("/2025");
      expect(search()).toBe("?hidePlayed=1");
      expect(stored("players")).toEqual([]);
    });

    it("adds no query on game pages", () => {
      at("/2025/games/11");
      localStorage.setItem("players", JSON.stringify(["alice"]));
      render();

      expect(search()).toBe("");
    });

    it("keeps saved players when the scores fail to load", () => {
      at("/2026?players=bob");
      localStorage.setItem("players", JSON.stringify(["alice"]));
      state.data = { ...emptyData, error: true };
      render();

      expect(stored("players")).toEqual(["alice"]);
    });

    it("does not apply a link for an unknown year to another year", async () => {
      const user = userEvent.setup();
      at("/2030?players=alice");
      localStorage.setItem("players", JSON.stringify(["bob"]));
      const { getByRole } = render();

      await user.click(getByRole("link", { name: "View 2026" }));

      expect(stored("players")).toEqual(["bob"]);
      expect(search()).toBe("?players=bob");
    });
  });

  describe("sort mode", () => {
    // Everyone scores every game: Y has the best score but the worst rank.
    const rows = (game: string, id: number, rank: number, score: number) =>
      ["a", "b", "c", "d"].map((player) => ({
        player,
        game,
        rank,
        score,
        bgg_id: id,
      }));
    const all = [
      ...rows("Y", 1, 3, 90),
      ...rows("Z", 2, 1, 70),
      ...rows("X", 3, 2, 50),
    ];
    const trio: Data = {
      ...emptyData,
      max: 100,
      by_player: Object.fromEntries(
        ["a", "b", "c", "d"].map((p) => [p, all.filter((r) => r.player === p)]),
      ),
    };
    const order = (container: HTMLElement) =>
      [...container.querySelectorAll(".tray-podium .tray-name")].map(
        (el) => el.textContent,
      );
    const picked = (container: HTMLElement) =>
      container.querySelector(".splits__head strong")?.textContent;
    const stored = () => JSON.parse(localStorage.getItem("sort_mode")!);

    beforeEach(() => {
      at("/2026");
      state.data = trio;
      localStorage.setItem("players", JSON.stringify(["a", "b", "c", "d"]));
    });

    it("defaults to total", () => {
      const { container, getByRole } = render();

      expect(getByRole("radio", { name: "Total" })).toBeChecked();
      expect(order(container)).toEqual(["Y", "Z", "X"]);
      expect(picked(container)).toContain("Y + Z");
      expect(window.location.search).not.toContain("sort");
    });

    it("restores a saved mode", () => {
      localStorage.setItem("sort_mode", JSON.stringify("lowest"));
      const { container, getByRole } = render();

      expect(getByRole("radio", { name: "Lowest rank" })).toBeChecked();
      expect(order(container)).toEqual(["Z", "X", "Y"]);
    });

    it("falls back to total for an invalid saved value", () => {
      localStorage.setItem("sort_mode", JSON.stringify("bogus"));
      const { container, getByRole } = render();

      expect(getByRole("radio", { name: "Total" })).toBeChecked();
      expect(order(container)).toEqual(["Y", "Z", "X"]);
    });

    it("reorders the list and the splits, and updates the link", async () => {
      const user = userEvent.setup();
      const { container, getByText } = render();

      await user.click(getByText("Lowest rank"));

      expect(order(container)).toEqual(["Z", "X", "Y"]);
      expect(picked(container)).toContain("X + Z");
      expect(stored()).toBe("lowest");
      expect(window.location.search).toContain("sort=lowest");
    });

    it("lets a shared link override the saved mode", () => {
      localStorage.setItem("sort_mode", JSON.stringify("even"));
      at("/2026?players=a,b,c,d&sort=lowest");
      const { container } = render();

      expect(stored()).toBe("lowest");
      expect(order(container)).toEqual(["Z", "X", "Y"]);
      expect(window.location.search).toBe("?players=a,b,c,d&sort=lowest");
    });

    it("orders the list by the even mode", () => {
      localStorage.setItem("sort_mode", JSON.stringify("even"));
      const { container, getByRole } = render();

      expect(getByRole("radio", { name: "Most even" })).toBeChecked();
      // Every game is perfectly even, so total score breaks the tie.
      expect(order(container)).toEqual(["Y", "Z", "X"]);
    });

    it("resets a saved mode when a link carries filters but no sort", () => {
      localStorage.setItem("sort_mode", JSON.stringify("even"));
      at("/2026?players=a,b,c,d");
      const { getByRole } = render();

      expect(stored()).toBe("total");
      expect(getByRole("radio", { name: "Total" })).toBeChecked();
    });

    it("includes the mode in the copied link", async () => {
      const user = userEvent.setup();
      localStorage.setItem("sort_mode", JSON.stringify("even"));
      const writeText = vi.spyOn(navigator.clipboard, "writeText");
      const { getByRole } = render();

      await user.click(getByRole("button", { name: "Copy link" }));

      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("sort=even"),
      );
    });
  });

  describe("member player count ranges", () => {
    const linked: Data = {
      ...loadedData,
      by_player: {
        alice: [
          {
            game: "Belfort",
            player: "alice",
            rank: 1,
            score: 50,
            bgg_id: 11,
            discord_id: "d1",
          },
        ],
        bob: loadedData.by_player.bob,
      },
    };
    const pick = () =>
      localStorage.setItem("players", JSON.stringify(["alice", "bob"]));

    it("hides a game whose range excludes the selected group size", () => {
      at("/2026");
      state.data = linked;
      state.ranges = { d1: { "11": { min: 3, max: 4 } } };
      pick();
      const { getByText, queryByText } = render();

      expect(queryByText("Belfort")).toBeNull();
      expect(
        getByText(/fit a group of that size/, { exact: false }),
      ).toBeInTheDocument();
    });

    it("keeps the game when the group size is inside the range", () => {
      at("/2026");
      state.data = linked;
      state.ranges = { d1: { "11": { min: 2, max: 2 } } };
      pick();
      const { getByText } = render();

      expect(getByText("Belfort")).toBeInTheDocument();
    });

    it("shows the member's own range form on the game page", () => {
      at("/2026/games/11");
      state.games = {
        games: { 11: { players: { min: 2, max: 6 } } },
        loading: false,
        error: false,
      };
      state.ranges = { "1": { "11": { min: 3, max: 4 } } };
      const { getByText } = render();

      expect(getByText("Your player count")).toBeInTheDocument();
      expect(getByText("Your override")).toBeInTheDocument();
    });
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

  describe("hiding played games", () => {
    const linked: Data = {
      ...loadedData,
      by_player: {
        alice: [
          {
            game: "Belfort",
            player: "alice",
            rank: 1,
            score: 50,
            bgg_id: 11,
            discord_id: "d-alice",
          },
        ],
        bob: [
          { game: "Belfort", player: "bob", rank: 2, score: 30, bgg_id: 11 },
        ],
      },
    };

    beforeEach(() => {
      at("/2026");
      state.data = linked;
      localStorage.setItem("hide_played", "true");
    });

    it("fetches everyone's counts for the viewed year", () => {
      render();
      expect(state.useAllPlayedCounts).toHaveBeenLastCalledWith("2026");
    });

    it("hides a game another selected player has played", () => {
      state.allPlayed = { "d-alice": { "11": 1 } };
      const { getByText, queryByText } = render();

      expect(getByText(/played every ranked game/)).toBeInTheDocument();
      expect(queryByText("Belfort")).toBeNull();
    });

    it("ignores plays by players who are not selected", () => {
      state.allPlayed = { "d-alice": { "11": 1 } };
      localStorage.setItem("players", JSON.stringify(["bob"]));
      const { getByText } = render();

      expect(getByText("Belfort")).toBeInTheDocument();
    });

    it("lets the member's own edits override their fetched counts", () => {
      state.allPlayed = { "1": { "11": 1 } };
      state.data = {
        ...linked,
        by_player: {
          ...linked.by_player,
          alice: linked.by_player.alice.map((r) => ({ ...r, discord_id: "1" })),
        },
      };
      state.own = { 12: 1 };
      const { getByText } = render();

      expect(getByText("Belfort")).toBeInTheDocument();
    });

    it("unhides a game once the member's own plays drop to zero", () => {
      state.allPlayed = { "1": { "11": 1 } };
      state.data = {
        ...linked,
        by_player: {
          ...linked.by_player,
          alice: linked.by_player.alice.map((r) => ({ ...r, discord_id: "1" })),
        },
      };
      state.own = {};
      const { getByText, queryByText } = render();

      expect(getByText("Belfort")).toBeInTheDocument();
      expect(queryByText("alice ×1")).toBeNull();
    });

    it("shows who played a game while it is visible", () => {
      localStorage.setItem("hide_played", "false");
      state.allPlayed = { "d-alice": { "11": 3 } };
      const { getByText } = render();

      expect(getByText("alice ×3")).toBeInTheDocument();
    });
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

  describe("suggested splits", () => {
    const names = ["ann", "ben", "cat", "dan"];
    const row = (player: string, game: string, id: number, score: number) => ({
      game,
      player,
      rank: 1,
      score,
      bgg_id: id,
    });
    // Duo games are scored by one pair each; Party by everyone.
    const splitData: Data = {
      ...emptyData,
      max: 100,
      by_player: {
        ann: [row("ann", "Duel", 1, 90), row("ann", "Party", 3, 20)],
        ben: [row("ben", "Duel", 1, 90), row("ben", "Party", 3, 20)],
        cat: [row("cat", "Joust", 2, 80), row("cat", "Party", 3, 20)],
        dan: [row("dan", "Joust", 2, 80), row("dan", "Party", 3, 20)],
      },
    };

    it("shows suggestions when four players are selected", () => {
      at("/2026");
      state.data = splitData;
      localStorage.setItem("players", JSON.stringify(names));
      const { getByText } = render();

      expect(getByText("Suggested splits")).toBeInTheDocument();
      expect(getByText(/\d \+ \d · Duel \+ Joust/)).toBeInTheDocument();
    });

    it("hides them with fewer than four players or none selected", () => {
      at("/2026");
      state.data = splitData;
      localStorage.setItem("players", JSON.stringify(names.slice(0, 3)));
      const { queryByText, unmount } = render();
      expect(queryByText("Suggested splits")).toBeNull();
      unmount();

      localStorage.setItem("players", JSON.stringify([]));
      const again = render();
      expect(again.queryByText("Suggested splits")).toBeNull();
    });

    it("still shows them when the main list is empty", () => {
      at("/2026");
      // Duo-only games are out of range for four players, so nothing ranks.
      state.games = {
        games: {
          1: { players: { min: 2, max: 2 } },
          2: { players: { min: 2, max: 2 } },
          3: { players: { min: 2, max: 2 } },
        },
        loading: false,
        error: false,
      };
      state.data = splitData;
      localStorage.setItem("players", JSON.stringify(names));
      const { getByText } = render();

      expect(getByText("No games to rank")).toBeInTheDocument();
      expect(getByText("Suggested splits")).toBeInTheDocument();
    });
  });
});
