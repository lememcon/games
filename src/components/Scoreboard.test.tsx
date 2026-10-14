import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
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
  // The member's own played games as the hook returns them; null means not loaded.
  own: {} as Record<string, number> | null,
  allPlayed: {} as Record<string, Record<string, number>>,
  useAllPlayed: vi.fn(),
  markPlayed: vi.fn(),
  togglePlayed: vi.fn(),
  markConfirmed: vi.fn(),
  usePlayed: vi.fn(),
  // Everyone's own player count ranges, by discord id then bgg id.
  ranges: {} as Record<string, Record<string, { min: number; max: number }>>,
  savePlayerRange: vi.fn(),
  // Everyone's vetoes, by discord id then bgg id.
  vetoes: {} as Record<string, ReadonlySet<string>>,
  useVetoes: vi.fn(),
  veto: vi.fn(),
  unveto: vi.fn(),
  vetoErrors: {} as Record<number, string>,
  vetoSaving: new Set<number>(),
  playedError: null as string | null,
  unplayed: [] as { bgg_id: number; name: string }[],
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
vi.mock("@/hooks/useUnplayedGames", () => ({
  default: () => state.unplayed,
}));
vi.mock("@/hooks/useYears", () => ({ default: () => state.years }));
vi.mock("@/hooks/useGames", () => ({ default: () => state.games }));
vi.mock("@/hooks/usePlayed", () => ({
  default: (year: string) => {
    state.usePlayed(year);
    return [
      (id: string) => (state.played[id] ?? 0) > 0,
      state.togglePlayed,
      state.own,
      state.markConfirmed,
      state.playedError,
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

vi.mock("@/hooks/useVetoes", () => ({
  default: (...args: unknown[]) => {
    state.useVetoes(...args);
    return {
      all: state.vetoes,
      saving: state.vetoSaving,
      bulkError: null,
      vetoMany: vi.fn(),
      clearBulkError: vi.fn(),
      error: state.vetoErrors,
      isSaving: (id: number) => state.vetoSaving.has(id),
      errorFor: (id: number) => state.vetoErrors[id] ?? null,
      veto: state.veto,
      unveto: state.unveto,
    };
  },
}));

vi.mock("@/hooks/useAllPlayed", () => ({
  useMarkPlayed: (year: string) => {
    state.useAllPlayed(year);
    return [state.allPlayed, state.markPlayed];
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
    state.vetoes = {};
    state.veto = vi.fn(async () => true);
    state.unveto = vi.fn(async () => true);
    state.vetoErrors = {};
    state.vetoSaving = new Set();
    state.playedError = null;
    state.unplayed = [];
  });
  afterEach(() => {
    // Unmount before resetting the URL, or a mounted Scoreboard redirects.
    cleanup();
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("gives the played games the year only once the years have loaded", () => {
    at("/2026");
    state.years = { years: [], loading: true, error: false };
    const { rerender } = render();
    expect(state.usePlayed).toHaveBeenLastCalledWith("");

    state.years = { years: ["2025", "2026"], loading: false, error: false };
    rerender(
      <MantineProvider>
        <Scoreboard user={member} />
      </MantineProvider>,
    );
    expect(state.usePlayed).toHaveBeenLastCalledWith("2026");
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

  it("shows a played load or save error", () => {
    at("/2026");
    state.playedError = "Couldn't save. Try again.";
    const { getByRole } = render();

    expect(getByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
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

  describe("marking played", () => {
    const linked: Data = {
      ...loadedData,
      scores: loadedData.by_id[11],
      by_player: {
        alice: [
          {
            game: "Belfort",
            player: "alice",
            rank: 1,
            score: 50,
            bgg_id: 11,
            discord_id: "1",
          },
        ],
        bob: [
          {
            game: "Belfort",
            player: "bob",
            rank: 2,
            score: 30,
            bgg_id: 11,
            discord_id: "2",
          },
        ],
      },
    };

    it("opens the dialog instead of marking straight away", async () => {
      const user = userEvent.setup();
      at("/2026");
      state.data = linked;
      render();

      await user.click(await screen.findByRole("button", { name: /^Played:/ }));

      expect(
        await screen.findByRole("dialog", { name: /Mark "Belfort" played/ }),
      ).toBeInTheDocument();
      expect(state.togglePlayed).not.toHaveBeenCalled();
    });

    it("does nothing while the member's own games have not loaded", async () => {
      const user = userEvent.setup();
      at("/2026");
      state.own = null;
      render();

      await user.click(await screen.findByRole("button", { name: /^Played:/ }));

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(state.togglePlayed).not.toHaveBeenCalled();
    });

    it("unmarks a played game directly", async () => {
      const user = userEvent.setup();
      at("/2026");
      state.played = { "11": 1 };
      state.own = { "11": 1 };
      render();

      await user.click(await screen.findByRole("button", { name: /^Played:/ }));

      expect(state.togglePlayed).toHaveBeenCalledWith("11");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("marks the chosen members and then the member themself", async () => {
      const user = userEvent.setup();
      at("/2026");
      state.data = linked;
      render();

      await user.click(await screen.findByRole("button", { name: /^Played:/ }));
      await user.click(
        await within(await screen.findByRole("dialog")).findByRole("button", {
          name: "bob",
        }),
      );
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Mark 2 played",
        }),
      );

      await waitFor(() =>
        expect(state.markPlayed).toHaveBeenCalledWith("11", ["1", "2"]),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(state.markConfirmed).toHaveBeenCalledWith("11");
      expect(state.togglePlayed).not.toHaveBeenCalled();
    });

    it("does not toggle the member's own game when they are left out", async () => {
      const user = userEvent.setup();
      at("/2026");
      state.data = linked;
      render();

      await user.click(await screen.findByRole("button", { name: /^Played:/ }));
      await user.click(
        await within(await screen.findByRole("dialog")).findByRole("button", {
          name: "alice (you)",
        }),
      );
      await user.click(
        await within(await screen.findByRole("dialog")).findByRole("button", {
          name: "bob",
        }),
      );
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Mark 1 played",
        }),
      );

      await waitFor(() =>
        expect(state.markPlayed).toHaveBeenCalledWith("11", ["2"]),
      );
      expect(state.togglePlayed).not.toHaveBeenCalled();
    });

    it("shows an error and keeps the dialog open when marking fails", async () => {
      const user = userEvent.setup();
      at("/2026");
      state.data = linked;
      state.markPlayed.mockRejectedValueOnce(new Error("nope"));
      render();

      await user.click(await screen.findByRole("button", { name: /^Played:/ }));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "bob",
        }),
      );
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Mark 2 played",
        }),
      );

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(state.togglePlayed).not.toHaveBeenCalled();
    });

    it("closes the dialog when the year changes", async () => {
      const user = userEvent.setup();
      at("/2026");
      state.data = linked;
      render();

      await user.click(await screen.findByRole("button", { name: /^Played:/ }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      act(() => {
        window.history.pushState({}, "", "/2025");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("closes without marking on Cancel", async () => {
      const user = userEvent.setup();
      at("/2026");
      render();

      await user.click(await screen.findByRole("button", { name: /^Played:/ }));
      await user.click(
        await within(await screen.findByRole("dialog")).findByRole("button", {
          name: "Cancel",
        }),
      );

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(state.markPlayed).not.toHaveBeenCalled();
    });
  });

  it("shows the never-played shelf on the year landing", () => {
    at("/2026");
    state.unplayed = [{ bgg_id: 7, name: "Ghost" }];
    render();

    expect(
      screen.getByRole("button", { name: "Never played (1)" }),
    ).toBeInTheDocument();
  });

  it("shows no never-played shelf when every game has been played", () => {
    at("/2026");
    render();

    expect(screen.queryByText(/Never played/)).toBeNull();
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

    it("keeps the filters when a game is opened and the member goes back", async () => {
      at("/2026?players=alice&hidePlayed=1&sort=even");
      const user = userEvent.setup();
      const { getByRole, getAllByRole, getByText } = render();

      await user.click(getByRole("link", { name: "Belfort" }));
      expect(path()).toBe("/2026/games/11");
      const back = getAllByRole("link", { name: "Back to games" });
      expect(back[0]).toHaveAttribute(
        "href",
        "/2026?players=alice&hidePlayed=1&sort=even",
      );

      await user.click(back[0]);
      expect(path()).toBe("/2026");
      expect(search()).toBe("?players=alice&hidePlayed=1&sort=even");
      expect(getByText("Filter By Players")).toBeInTheDocument();
      expect(stored("players")).toEqual(["alice"]);
      expect(stored("hide_played")).toBe(true);
      expect(stored("sort_mode")).toBe("even");
    });

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

  describe("back and forward", () => {
    const search = () => window.location.search;
    const stored = (key: string) => JSON.parse(localStorage.getItem(key)!);
    const go = (target: string) =>
      act(() => {
        at(target);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
    // Navigation as the browser does it: the address changes, then popstate.
    const nav = (target: string) =>
      act(() => {
        window.history.replaceState({}, "", target);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

    it("re-applies the query on back", () => {
      at("/2026?players=alice");
      render();
      expect(stored("players")).toEqual(["alice"]);

      nav("/2026?players=bob");

      expect(stored("players")).toEqual(["bob"]);
      expect(search()).toBe("?players=bob");
    });

    it("re-applies hide-played and sort on forward", () => {
      at("/2026?players=alice");
      render();

      nav("/2026?players=bob&hidePlayed=1&sort=even");
      expect(stored("players")).toEqual(["bob"]);
      expect(stored("hide_played")).toBe(true);
      expect(stored("sort_mode")).toBe("even");

      nav("/2026?players=alice");
      expect(stored("hide_played")).toBe(false);
      expect(stored("sort_mode")).toBe("total");
    });

    it("does not overwrite the entry or add history", () => {
      at("/2026?players=alice");
      render();
      const length = window.history.length;

      nav("/2026?players=bob&hidePlayed=1");

      expect(search()).toBe("?players=bob&hidePlayed=1");
      expect(window.history.length).toBe(length);
    });

    it("handles encoded names", () => {
      state.data = {
        ...loadedData,
        by_player: {
          ...loadedData.by_player,
          "Bob Smith": [],
          "Doe, Jane": [],
        },
      };
      at("/2026?players=alice");
      render();

      nav("/2026?players=Bob%20Smith");
      expect(stored("players")).toEqual(["Bob Smith"]);
      expect(search()).toBe("?players=Bob%20Smith");

      nav("/2026?players=Doe%2C%20Jane");
      expect(stored("players")).toEqual(["Doe, Jane"]);
      expect(search()).toBe("?players=Doe%2C%20Jane");
    });

    it("applies the query when going back to another year", async () => {
      at("/2026?players=alice");
      render();

      go("/2025");
      go("/2026?players=bob");

      await waitFor(() => expect(stored("players")).toEqual(["bob"]));
      expect(path()).toBe("/2026");
      expect(search()).toBe("?players=bob");
    });

    it("does not revert the query under StrictMode", () => {
      at("/2026?players=alice");
      renderWithMantine(
        <StrictMode>
          <Scoreboard user={member} />
        </StrictMode>,
      );

      nav("/2026?players=bob");

      expect(stored("players")).toEqual(["bob"]);
      expect(search()).toBe("?players=bob");
    });

    it("ignores a popstate that leaves the query unchanged", () => {
      at("/2026?players=alice");
      render();

      nav("/2026?players=alice");

      expect(stored("players")).toEqual(["alice"]);
      expect(search()).toBe("?players=alice");
    });

    it("ignores query changes off the year list", () => {
      at("/2026/games/11");
      render();

      nav("/2026/games/11?players=alice");

      expect(stored("players")).toBeNull();
    });

    it("keeps the filters and re-syncs when the query has no filters", () => {
      at("/2026?players=alice");
      render();

      nav("/2026");

      expect(stored("players")).toEqual(["alice"]);
      expect(search()).toBe("?players=alice");
    });

    it("drops unknown names", () => {
      at("/2026?players=alice");
      render();

      nav("/2026?players=bob,zed");

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

  describe("picked colors", () => {
    it("colors a player's filter chip with the color on their rows", () => {
      at("/2026");
      state.data = {
        ...loadedData,
        by_player: {
          alice: [{ ...loadedData.by_player.alice[0], color: "#6D48B0" }],
          bob: loadedData.by_player.bob,
        },
      };
      const { getByRole } = render();

      expect(getByRole("button", { name: "alice" })).toHaveStyle({
        color: "rgb(109, 72, 176)",
      });
      // bob keeps his place in the sorted list of all names.
      expect(getByRole("button", { name: "bob" })).toHaveStyle({
        color: "rgb(47, 107, 184)",
      });
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

  describe("member vetoes", () => {
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

    it("hides a game vetoed by a selected member", () => {
      at("/2026");
      state.data = linked;
      state.vetoes = { d1: new Set(["11"]) };
      localStorage.setItem("players", JSON.stringify(["alice", "bob"]));
      const { queryByText } = render();

      expect(queryByText("Belfort")).toBeNull();
    });

    it("keeps it when the vetoer is not selected", () => {
      at("/2026");
      state.data = linked;
      state.vetoes = { d1: new Set(["11"]) };
      localStorage.setItem("players", JSON.stringify(["bob"]));
      const { getByText } = render();

      expect(getByText("Belfort")).toBeInTheDocument();
    });

    it("fetches vetoes without a year", () => {
      at("/2026");
      render();
      expect(state.useVetoes).toHaveBeenCalledWith();
    });

    it("clears the selection when the year changes", async () => {
      at("/2026");
      const user = userEvent.setup();
      const { getByRole, getByLabelText, getByText, queryByText } = render();

      await user.click(getByRole("button", { name: "Select" }));
      await user.click(getByLabelText("Select Belfort"));
      expect(getByText("1 selected")).toBeInTheDocument();

      act(() => {
        at("/2025");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      await waitFor(() => expect(path()).toBe("/2025"));
      expect(queryByText(/selected$/)).toBeNull();
    });

    it("clears the selection when the filter changes", async () => {
      at("/2026");
      localStorage.setItem("players", JSON.stringify(["alice"]));
      const user = userEvent.setup();
      const { getByRole, getByLabelText, getByText, queryByText } = render();

      await user.click(getByRole("button", { name: "Select" }));
      await user.click(getByLabelText("Select Belfort"));
      expect(getByText("1 selected")).toBeInTheDocument();

      await user.click(getByLabelText(/Hide games played/));
      expect(queryByText(/selected$/)).toBeNull();
    });

    it("vetoes a game from its card", async () => {
      at("/2026");
      const user = userEvent.setup();
      const { getByRole } = render();

      await user.click(getByRole("button", { name: "Veto: Belfort" }));

      expect(state.veto).toHaveBeenCalledWith(11);
    });

    it("unvetoes a game the member already vetoed", async () => {
      at("/2026");
      state.vetoes = { "1": new Set(["11"]) };
      const user = userEvent.setup();
      const { getByRole } = render();

      const button = getByRole("button", { name: "Veto: Belfort" });
      expect(button).toHaveAttribute("aria-pressed", "true");
      await user.click(button);

      expect(state.unveto).toHaveBeenCalledWith(11);
    });

    describe("undo bar", () => {
      const ids = [11, 12, 13, 14];
      const names = ["Belfort", "Chess", "Go", "Nim"];
      const four: Data = {
        ...loadedData,
        by_player: {
          alice: ids.map((bgg_id, i) => ({
            game: names[i],
            player: "alice",
            rank: 1,
            score: 50 - i,
            bgg_id,
          })),
          bob: ids.map((bgg_id, i) => ({
            game: names[i],
            player: "bob",
            rank: 2,
            score: 30 - i,
            bgg_id,
          })),
        },
      };

      afterEach(() => vi.useRealTimers());

      const veto = async (name: string) => {
        const user = userEvent.setup();
        const view = render();
        await user.click(view.getByRole("button", { name: `Veto: ${name}` }));
        return { user, ...view };
      };

      it("shows the bar after a podium veto", async () => {
        at("/2026");
        const { getByRole } = await veto("Belfort");

        expect(getByRole("status")).toHaveTextContent("Vetoed Belfort.");
        expect(state.veto).toHaveBeenCalledWith(11);
      });

      it("shows the bar after a veto from a row", async () => {
        at("/2026");
        state.data = four;
        const { getByRole } = await veto("Nim");

        expect(getByRole("status")).toHaveTextContent("Vetoed Nim.");
        expect(state.veto).toHaveBeenCalledWith(14);
      });

      it("keeps the bar when the last visible game is vetoed", async () => {
        at("/2026");
        const user = userEvent.setup();
        const { getByRole, rerender } = render();
        await user.click(getByRole("button", { name: "Veto: Belfort" }));

        state.vetoes = { "1": new Set(["11"]) };
        state.data = { ...emptyData };
        localStorage.setItem("players", JSON.stringify(["alice"]));
        rerender(
          <MantineProvider>
            <Scoreboard user={member} />
          </MantineProvider>,
        );
        expect(getByRole("status")).toHaveTextContent("Vetoed Belfort.");
      });

      it("renders an empty live region with no veto", () => {
        at("/2026");
        state.data = { ...emptyData };
        const { getByRole } = render();

        expect(getByRole("status")).toBeEmptyDOMElement();
        expect(getByRole("status")).toHaveAttribute("aria-live", "polite");
      });

      it("captures the name and id at click time", async () => {
        at("/2026");
        let finish!: (ok: boolean) => void;
        state.veto = vi.fn(() => new Promise<boolean>((r) => (finish = r)));
        const { getByRole, rerender } = await veto("Belfort");

        state.data = { ...emptyData };
        rerender(
          <MantineProvider>
            <Scoreboard user={member} />
          </MantineProvider>,
        );
        await act(async () => finish(true));
        expect(getByRole("status")).toHaveTextContent("Vetoed Belfort.");

        await userEvent.click(getByRole("button", { name: "Undo" }));
        expect(state.unveto).toHaveBeenCalledWith(11);
      });

      it("focuses Undo when the bar appears", async () => {
        at("/2026");
        const { getByRole } = await veto("Belfort");

        expect(getByRole("button", { name: "Undo" })).toHaveFocus();
      });

      it("undoes by numeric id and hides the bar", async () => {
        at("/2026");
        const { user, getByRole, queryByRole } = await veto("Belfort");

        await user.click(getByRole("button", { name: "Undo" }));

        expect(state.unveto).toHaveBeenCalledWith(11);
        expect(queryByRole("button", { name: "Undo" })).toBeNull();
      });

      it("keeps the bar with the error when the undo fails", async () => {
        at("/2026");
        state.unveto = vi.fn(async () => {
          state.vetoErrors = { 11: "Something went wrong" };
          return false;
        });
        const { user, getByRole, rerender } = await veto("Belfort");
        // The vetoed game is filtered out of the list, as in the real app.
        state.vetoes = { "1": new Set(["11"]) };
        rerender(
          <MantineProvider>
            <Scoreboard user={member} />
          </MantineProvider>,
        );

        await user.click(getByRole("button", { name: "Undo" }));
        rerender(
          <MantineProvider>
            <Scoreboard user={member} />
          </MantineProvider>,
        );

        expect(getByRole("button", { name: "Undo" })).toBeInTheDocument();
        expect(getByRole("status")).toHaveTextContent("Something went wrong");
      });

      it("ignores a veto that resolves after a newer one", async () => {
        at("/2026");
        state.data = four;
        const finish: Array<(ok: boolean) => void> = [];
        state.veto = vi.fn(
          () => new Promise<boolean>((r) => void finish.push(r)),
        );
        const user = userEvent.setup();
        const { getByRole } = render();
        await user.click(getByRole("button", { name: "Veto: Nim" }));
        await user.click(getByRole("button", { name: "Veto: Go" }));

        await act(async () => finish[1](true));
        await act(async () => finish[0](true));

        expect(getByRole("status")).toHaveTextContent("Vetoed Go.");
        expect(getByRole("status")).not.toHaveTextContent("Nim");
      });

      it("does not steal focus from an input the member moved to", async () => {
        at("/2026");
        let finish!: (ok: boolean) => void;
        state.veto = vi.fn(() => new Promise<boolean>((r) => (finish = r)));
        await veto("Belfort");
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();

        await act(async () => finish(true));

        expect(input).toHaveFocus();
        input.remove();
      });

      it("clears the bar when the route changes", async () => {
        at("/2026");
        const { getByRole, queryByRole, rerender } = await veto("Belfort");
        expect(getByRole("button", { name: "Undo" })).toBeInTheDocument();

        at("/2026/games/11");
        rerender(
          <MantineProvider>
            <Scoreboard user={member} />
          </MantineProvider>,
        );
        at("/2026");
        rerender(
          <MantineProvider>
            <Scoreboard user={member} />
          </MantineProvider>,
        );

        expect(queryByRole("button", { name: "Undo" })).toBeNull();
      });

      it("disables Undo while the game is saving", async () => {
        at("/2026");
        const { getByRole, rerender } = await veto("Belfort");
        expect(getByRole("button", { name: "Undo" })).toBeEnabled();

        state.vetoSaving = new Set([11]);
        rerender(
          <MantineProvider>
            <Scoreboard user={member} />
          </MantineProvider>,
        );
        expect(getByRole("button", { name: "Undo" })).toBeDisabled();

        state.vetoSaving = new Set();
        rerender(
          <MantineProvider>
            <Scoreboard user={member} />
          </MantineProvider>,
        );
        expect(getByRole("button", { name: "Undo" })).toBeEnabled();
      });

      it("dismisses the bar", async () => {
        at("/2026");
        const { user, getByRole, queryByRole } = await veto("Belfort");

        await user.click(getByRole("button", { name: "Dismiss" }));

        expect(queryByRole("button", { name: "Undo" })).toBeNull();
        expect(state.unveto).not.toHaveBeenCalled();
      });

      it("shows no bar when the veto fails", async () => {
        at("/2026");
        state.veto = vi.fn(async () => false);
        const { getByRole, queryByRole } = await veto("Belfort");

        expect(queryByRole("button", { name: "Undo" })).toBeNull();
        expect(getByRole("status")).toBeEmptyDOMElement();
      });

      it("replaces the bar on a second veto and restarts the timer", async () => {
        at("/2026");
        state.data = four;
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const { getByRole } = render();

        await user.click(getByRole("button", { name: "Veto: Nim" }));
        expect(getByRole("status")).toHaveTextContent("Vetoed Nim.");
        act(() => void vi.advanceTimersByTime(5000));
        await user.click(getByRole("button", { name: "Veto: Go" }));
        await act(async () => {});
        expect(getByRole("status")).toHaveTextContent("Vetoed Go.");

        act(() => void vi.advanceTimersByTime(6000));
        expect(getByRole("status")).toHaveTextContent("Vetoed Go.");
        act(() => void vi.advanceTimersByTime(4100));
        expect(getByRole("status")).toBeEmptyDOMElement();
      });

      it("disappears after 10 seconds", async () => {
        at("/2026");
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const { getByRole } = render();
        await user.click(getByRole("button", { name: "Veto: Belfort" }));

        act(() => void vi.advanceTimersByTime(5000));
        expect(getByRole("status")).toHaveTextContent("Vetoed Belfort.");
        act(() => void vi.advanceTimersByTime(5100));
        expect(getByRole("status")).toBeEmptyDOMElement();
      });

      it("pauses the timer while hovered", async () => {
        at("/2026");
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const { getByRole } = render();
        await user.click(getByRole("button", { name: "Veto: Belfort" }));

        await user.hover(getByRole("button", { name: "Dismiss" }));
        act(() => void vi.advanceTimersByTime(30000));
        expect(getByRole("status")).toHaveTextContent("Vetoed Belfort.");

        await user.unhover(getByRole("button", { name: "Dismiss" }));
        act(() => void vi.advanceTimersByTime(10100));
        expect(getByRole("status")).toBeEmptyDOMElement();
      });

      it("pauses the timer while focus is inside the bar", async () => {
        at("/2026");
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const { getByRole } = render();
        await user.click(getByRole("button", { name: "Veto: Belfort" }));
        expect(getByRole("button", { name: "Undo" })).toHaveFocus();

        await user.tab();
        act(() => void vi.advanceTimersByTime(1000));
        expect(getByRole("button", { name: "Dismiss" })).toHaveFocus();
        act(() => void vi.advanceTimersByTime(30000));
        expect(getByRole("status")).toHaveTextContent("Vetoed Belfort.");

        act(() => getByRole("button", { name: "Dismiss" }).blur());
        act(() => void vi.advanceTimersByTime(10100));
        expect(getByRole("status")).toBeEmptyDOMElement();
      });

      it("leaves no timers after unmount", async () => {
        at("/2026");
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const { getByRole, unmount } = render();
        const before = vi.getTimerCount();
        await user.click(getByRole("button", { name: "Veto: Belfort" }));
        await act(async () => {});
        expect(getByRole("status")).toHaveTextContent("Vetoed Belfort.");

        unmount();
        expect(vi.getTimerCount()).toBeLessThanOrEqual(before);
      });
    });

    it("shows a veto error", () => {
      at("/2026");
      state.vetoErrors = { 11: "Something went wrong" };
      const { getByRole } = render();

      expect(getByRole("alert")).toHaveTextContent("Something went wrong");
    });

    it("shows the member's veto switch on the game page", () => {
      at("/2026/games/11");
      state.vetoes = { "1": new Set(["11"]) };
      const { getByRole } = render();

      expect(getByRole("switch", { name: "Not for me" })).toBeChecked();
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

    it("fetches everyone's played games for the viewed year", () => {
      render();
      expect(state.useAllPlayed).toHaveBeenLastCalledWith("2026");
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

    it("lets the member's own edits override their fetched played games", () => {
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
      const { getByText, queryByLabelText } = render();

      expect(getByText("Belfort")).toBeInTheDocument();
      expect(queryByLabelText("Played by")).toBeNull();
    });

    it("shows who played a game while it is visible", () => {
      localStorage.setItem("hide_played", "false");
      state.allPlayed = { "d-alice": { "11": 1 } };
      const { getByLabelText } = render();

      expect(getByLabelText("Played by")).toHaveTextContent("alice");
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
      expect(state.usePlayed).toHaveBeenLastCalledWith("");
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

    it("keeps the query and applies the filters through the / redirect", () => {
      at("/?players=alice&hidePlayed=1");
      render();
      expect(path()).toBe("/2026");
      expect(window.location.search).toBe("?players=alice&hidePlayed=1");
      expect(JSON.parse(localStorage.getItem("players")!)).toEqual(["alice"]);
      expect(JSON.parse(localStorage.getItem("hide_played")!)).toBe(true);
    });

    it("keeps the query through the legacy /games/:id redirect", () => {
      at("/games/11?sort=lowest");
      render();
      expect(path()).toBe("/2026/games/11");
      expect(window.location.search).toBe("?sort=lowest");
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
