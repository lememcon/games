import { describe, expect, it } from "vitest";

import Game from "@/components/Game";
import { renderWithMantine } from "@/test/utils";

const data = {
  max: 100,
  by_id: {
    // "11" exists in games.json (players 2-7), exercising the bounds branch.
    11: [
      { player: "alice", game: "Belfort", rank: 1, score: 80 },
      { player: "bob", game: "Belfort", rank: 2, score: 40 },
    ],
    // An id absent from games.json leaves bounds/image null.
    999999: [{ player: "alice", game: "Unknown Game", rank: 1, score: 10 }],
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

  it("renders nothing when the id has no scores", () => {
    const { queryByRole } = renderWithMantine(
      <Game data={data} id="missing" />,
    );
    expect(queryByRole("heading")).not.toBeInTheDocument();
    expect(queryByRole("table")).not.toBeInTheDocument();
  });
});
