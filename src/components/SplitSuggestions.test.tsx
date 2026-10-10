import { describe, expect, it } from "vitest";

import SplitSuggestions from "@/components/SplitSuggestions";
import { renderWithMantine } from "@/test/utils";
import type { GameSplit, SelectedGame } from "@/types";

const game = (
  name: string,
  id: string,
  score: number,
  image?: string,
): SelectedGame => ({
  name,
  image,
  id,
  score,
  min: 0,
  max: 99,
  players: {},
});

const split = (delta: number | null, perPlayer = 43.75): GameSplit => ({
  perPlayer,
  delta,
  groups: [
    {
      players: ["Kelsin", "Waymost"],
      picked: "Go",
      games: [game("Go", "1", 90), game("Chess", "2", 84)],
    },
    {
      players: ["Lemem", "TJ"],
      picked: "Netrunner",
      games: [game("Netrunner", "3", 85), game("Go", "1", 81)],
    },
  ],
});

const renderSplits = (splits: GameSplit[]) =>
  renderWithMantine(
    <SplitSuggestions splits={splits} year="2024" individualMax={100} />,
  );

describe("SplitSuggestions", () => {
  it("renders nothing without splits", () => {
    const { queryByText } = renderSplits([]);
    expect(queryByText("Suggested splits")).toBeNull();
  });

  it("shows the headline, groups, games and the chosen rows", () => {
    const { container, getByText, queryByText, getAllByRole } = renderSplits([
      split(23.75),
    ]);

    expect(getByText("Suggested splits")).toBeInTheDocument();
    expect(getByText(/2 \+ 2 · Go \+ Netrunner/)).toBeInTheDocument();
    expect(getByText(/43\.8 per player/)).toBeInTheDocument();
    expect(getByText("+23.8")).toHaveClass("splits__delta--up");
    expect(getByText("Kelsin")).toBeInTheDocument();
    expect(getByText("TJ")).toBeInTheDocument();
    expect(queryByText(/picked/i)).toBeNull();
    const chosen = container.querySelectorAll('[aria-current="true"]');
    expect(chosen).toHaveLength(2);
    expect(chosen[0]).toHaveTextContent("Go");
    expect(chosen[1]).toHaveTextContent("Netrunner");
    expect(getAllByRole("link", { name: "Go" })[0]).toHaveAttribute(
      "href",
      "/2024/games/1",
    );
  });

  it("marks a worse plan with a negative difference", () => {
    const { getByText } = renderSplits([split(-2.5)]);
    expect(getByText("-2.5")).toHaveClass("splits__delta--down");
  });

  it("omits the difference without a baseline", () => {
    const { container } = renderSplits([split(null)]);
    expect(container.querySelector(".splits__delta--up")).toBeNull();
    expect(container.querySelector(".splits__delta--down")).toBeNull();
  });

  it("shows cover art for games with an image", () => {
    const s = split(null);
    s.groups[0].games[0] = game("Go", "1", 90, "/go.jpg");
    const { getByAltText } = renderSplits([s]);
    expect(getByAltText("Go")).toHaveAttribute("src", "/go.jpg");
  });

  it("shows a blank cover for games without an image", () => {
    const { container } = renderSplits([split(null)]);
    expect(container.querySelector(".tray-cover__blank")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
