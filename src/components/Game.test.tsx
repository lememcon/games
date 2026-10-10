import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Game from "@/components/Game";
import { renderWithMantine } from "@/test/utils";
import type { Data, GamesData } from "@/types";

// "11" maps to the real bundled src/assets/games/11.jpg; "50" has no image;
// "60" only has an https URL.
const yearTotals = vi.hoisted(() => ({
  totals: [] as { year: number; bgg_id: number; total: number }[],
}));
vi.mock("@/hooks/useYearTotals", () => ({
  default: () => ({ ...yearTotals, loading: false, error: false }),
}));

const gameData: GamesData = {
  11: {
    players: { min: 2, max: 7 },
    image: "https://x.test/11.jpg",
    ext: ".jpg",
  },
  50: { players: { min: 1, max: 4 } },
  60: {
    players: { min: null, max: null },
    image: "https://x.test/60.png",
    ext: ".png",
  },
};

const data: Data = {
  loading: false,
  scores: [],
  by_game: {},
  by_player: {},
  max: 100,
  by_id: {
    // "11" is in gameData (players 2-7), exercising the bounds and image branches.
    11: [
      { bgg_id: 11, player: "alice", game: "Belfort", rank: 1, score: 80 },
      { bgg_id: 11, player: "bob", game: "Belfort", rank: 2, score: 40 },
    ],
    50: [{ bgg_id: 50, player: "alice", game: "Imageless", rank: 1, score: 5 }],
    60: [{ bgg_id: 60, player: "alice", game: "Remote", rank: 1, score: 5 }],
    // An id absent from gameData leaves bounds/image null.
    999999: [
      {
        bgg_id: 999999,
        player: "alice",
        game: "Unknown Game",
        rank: 1,
        score: 10,
      },
    ],
  },
};

describe("Game", () => {
  it("shows the across-the-years sparkline only with totals in 2+ years", () => {
    const view = () =>
      renderWithMantine(
        <Game data={data} gameData={gameData} year="2024" id="11" />,
      );
    yearTotals.totals = [{ year: 2024, bgg_id: 11, total: 120 }];
    expect(view().queryByLabelText(/^Total score by year,/)).toBeNull();
    yearTotals.totals = [
      { year: 2023, bgg_id: 11, total: 90 },
      { year: 2024, bgg_id: 11, total: 120 },
      { year: 2024, bgg_id: 50, total: 1 },
    ];
    expect(view().getByLabelText(/^Total score by year,/)).toHaveAttribute(
      "aria-label",
      "Total score by year, 2023 to 2024: 2023 90, 2024 120",
    );
    yearTotals.totals = [];
  });

  it("renders the game name, player bounds, and BGG link", () => {
    const { getByRole } = renderWithMantine(
      <Game data={data} gameData={gameData} year="2024" id="11" />,
    );

    expect(getByRole("heading", { name: "Belfort" })).toBeInTheDocument();
    expect(getByRole("link", { name: "BGG Page" })).toHaveAttribute(
      "href",
      "https://boardgamegeek.com/boardgame/11/",
    );
    expect(getByRole("link", { name: "BGG Page" })).toHaveTextContent(
      "BGG Page",
    );
  });

  it("links back to the year's scoreboard", () => {
    const { getAllByRole } = renderWithMantine(
      <Game data={data} gameData={gameData} year="2024" id="11" />,
    );
    const back = getAllByRole("link", { name: /Back to games/ });
    expect(back).toHaveLength(2);
    for (const link of back) expect(link).toHaveAttribute("href", "/2024");
  });

  it("links only players that have a discord id", () => {
    const linked: Data = {
      ...data,
      by_id: {
        ...data.by_id,
        11: data.by_id[11].map((row) =>
          row.player === "alice" ? { ...row, discord_id: "7" } : row,
        ),
      },
    };
    const { getByRole, queryByRole } = renderWithMantine(
      <Game data={linked} gameData={gameData} year="2024" id="11" />,
    );

    expect(getByRole("link", { name: "alice" })).toHaveAttribute(
      "href",
      "/players/7",
    );
    expect(queryByRole("link", { name: "bob" })).toBeNull();
  });

  it("renders a scores row per player", () => {
    const { getByText } = renderWithMantine(
      <Game data={data} gameData={gameData} year="2024" id="11" />,
    );
    expect(getByText("alice")).toBeInTheDocument();
    expect(getByText("bob")).toBeInTheDocument();
  });

  it("handles a game with no metadata", () => {
    const { getByRole } = renderWithMantine(
      <Game data={data} gameData={gameData} year="2024" id="999999" />,
    );
    expect(getByRole("heading", { name: "Unknown Game" })).toBeInTheDocument();
  });

  it("renders the cover image when the metadata has one", () => {
    const { getByRole } = renderWithMantine(
      <Game data={data} gameData={gameData} year="2024" id="11" />,
    );
    expect(getByRole("img")).toHaveAttribute(
      "src",
      expect.stringContaining("11.jpg"),
    );
  });

  it("falls back to the image URL and hides unknown bounds", () => {
    const { getByRole, queryByText } = renderWithMantine(
      <Game data={data} gameData={gameData} year="2024" id="60" />,
    );
    expect(getByRole("img")).toHaveAttribute("src", "https://x.test/60.png");
    expect(queryByText("Players:")).not.toBeInTheDocument();
  });

  it("renders a game whose metadata has no image", () => {
    const { getByRole, queryByRole } = renderWithMantine(
      <Game data={data} gameData={gameData} year="2024" id="50" />,
    );
    expect(getByRole("heading", { name: "Imageless" })).toBeInTheDocument();
    expect(queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders nothing when the id has no scores", () => {
    const { queryByRole } = renderWithMantine(
      <Game data={data} gameData={gameData} year="2024" id="missing" />,
    );
    expect(queryByRole("heading")).not.toBeInTheDocument();
    expect(queryByRole("table")).not.toBeInTheDocument();
  });

  describe("player count range form", () => {
    const overrides = (all = {}, extra = {}) => ({
      all,
      saving: false,
      error: null,
      save: vi.fn(),
      reset: vi.fn(),
      ...extra,
    });

    it("shows the stored range and resets for this game", async () => {
      const state = overrides({ d1: { "11": { min: 3, max: 4 } } });
      const { getByText, getByRole } = renderWithMantine(
        <Game
          data={data}
          gameData={gameData}
          year="2024"
          id="11"
          overrides={state}
          discordId="d1"
        />,
      );
      expect(getByText("Your player count")).toBeInTheDocument();
      expect(getByText("Allowed now: 2-7")).toBeInTheDocument();
      expect(getByRole("textbox", { name: "Minimum players" })).toHaveValue(
        "3",
      );
      await userEvent.click(getByRole("button", { name: "Reset" }));
      expect(state.reset).toHaveBeenCalledWith(11);
    });

    it("saves the narrowed range", async () => {
      const state = overrides();
      const { getByRole } = renderWithMantine(
        <Game
          data={data}
          gameData={gameData}
          year="2024"
          id="11"
          overrides={state}
          discordId="d1"
        />,
      );
      const input = getByRole("textbox", { name: "Minimum players" });
      await userEvent.clear(input);
      await userEvent.type(input, "4");
      await userEvent.click(getByRole("button", { name: "Save" }));
      expect(state.save).toHaveBeenCalledWith(11, { min: 4, max: 7 });
    });

    it("is hidden for a game with no known range or without overrides", () => {
      const noRange = renderWithMantine(
        <Game
          data={data}
          gameData={gameData}
          year="2024"
          id="60"
          overrides={overrides()}
          discordId="d1"
        />,
      );
      expect(noRange.queryByText("Your player count")).toBeNull();
      noRange.unmount();
      const without = renderWithMantine(
        <Game data={data} gameData={gameData} year="2024" id="11" />,
      );
      expect(without.queryByText("Your player count")).toBeNull();
    });
  });

  describe("veto switch", () => {
    const vetoes = (all = {}, extra = {}) => ({
      all,
      saving: false,
      error: null,
      veto: vi.fn(),
      unveto: vi.fn(),
      ...extra,
    });
    const view = (state: ReturnType<typeof vetoes> | undefined) =>
      renderWithMantine(
        <Game
          data={data}
          gameData={gameData}
          year="2024"
          id="11"
          vetoes={state}
          discordId="d1"
        />,
      );

    it("vetoes this game", async () => {
      const state = vetoes();
      const { getByRole } = view(state);
      await userEvent.click(getByRole("switch", { name: "Not for me" }));
      expect(state.veto).toHaveBeenCalledWith(11);
    });

    it("shows an existing veto and undoes it", async () => {
      const state = vetoes({ d1: new Set(["11"]) });
      const { getByRole } = view(state);
      const toggle = getByRole("switch", { name: "Not for me" });
      expect(toggle).toBeChecked();
      await userEvent.click(toggle);
      expect(state.unveto).toHaveBeenCalledWith(11);
    });

    it("is hidden without the vetoes prop", () => {
      expect(view(undefined).queryByText("Not for me")).toBeNull();
    });
  });
});
