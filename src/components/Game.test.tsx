import { describe, expect, it, vi } from "vitest";

import Game from "@/components/Game";
import { renderWithMantine } from "@/test/utils";
import type { Data } from "@/types";

// Mocked entries: "11" maps to the real src/assets/games/11.jpg; "50" has no image.
vi.mock("@/assets/games.json", () => ({
  default: {
    11: { players: { min: 2, max: 7 }, image: "11", ext: ".jpg" },
    50: { players: { min: 1, max: 4 } },
  },
}));

const data: Data = {
  loading: false,
  scores: [],
  by_game: {},
  by_player: {},
  max: 100,
  by_id: {
    // "11" is in the mocked games.json (players 2-7), exercising the bounds and image branches.
    11: [
      { bgg_id: 11, player: "alice", game: "Belfort", rank: 1, score: 80 },
      { bgg_id: 11, player: "bob", game: "Belfort", rank: 2, score: 40 },
    ],
    50: [{ bgg_id: 50, player: "alice", game: "Imageless", rank: 1, score: 5 }],
    // An id absent from the mocked games.json leaves bounds/image null.
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
  it("renders the game name, player bounds, and BGG link", () => {
    const { getByRole } = renderWithMantine(<Game data={data} id="11" />);

    expect(getByRole("heading", { name: "Belfort" })).toBeInTheDocument();
    expect(getByRole("link", { name: "BGG Page" })).toHaveAttribute(
      "href",
      "https://boardgamegeek.com/boardgame/11/",
    );
    expect(getByRole("link", { name: "BGG Page" })).toHaveTextContent(
      "BGG Page",
    );
  });

  it("renders a scores row per player", () => {
    const { getByText } = renderWithMantine(<Game data={data} id="11" />);
    expect(getByText("alice")).toBeInTheDocument();
    expect(getByText("bob")).toBeInTheDocument();
  });

  it("handles a game with no metadata", () => {
    const { getByRole } = renderWithMantine(<Game data={data} id="999999" />);
    expect(getByRole("heading", { name: "Unknown Game" })).toBeInTheDocument();
  });

  it("renders the cover image when the metadata has one", () => {
    const { getByRole } = renderWithMantine(<Game data={data} id="11" />);
    expect(getByRole("img")).toHaveAttribute(
      "src",
      expect.stringContaining("11.jpg"),
    );
  });

  it("renders a game whose metadata has no image", () => {
    const { getByRole, queryByRole } = renderWithMantine(
      <Game data={data} id="50" />,
    );
    expect(getByRole("heading", { name: "Imageless" })).toBeInTheDocument();
    expect(queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders nothing when the id has no scores", () => {
    const { queryByRole } = renderWithMantine(
      <Game data={data} id="missing" />,
    );
    expect(queryByRole("heading")).not.toBeInTheDocument();
    expect(queryByRole("table")).not.toBeInTheDocument();
  });
});
