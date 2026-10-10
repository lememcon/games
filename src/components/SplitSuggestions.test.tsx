import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  playedBy: {},
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

const expand = async (utils: ReturnType<typeof renderSplits>) => {
  await userEvent.click(utils.getAllByRole("button")[0]);
  await utils.findByText("Chess");
};

describe("SplitSuggestions", () => {
  it("renders nothing without splits", () => {
    const { queryByText } = renderSplits([]);
    expect(queryByText("Suggested splits")).toBeNull();
  });

  it("is collapsed by default, showing players and picked games", () => {
    const { getByText, getAllByRole, getAllByTestId } = renderSplits([
      split(23.75),
    ]);

    expect(getAllByRole("button")[0]).toHaveAttribute("aria-expanded", "false");
    expect(getByText(/2 \+ 2 · Go \+ Netrunner/)).toBeVisible();
    expect(getByText(/43\.8 per player/)).toBeVisible();
    expect(getByText("+23.8")).toHaveClass("splits__delta--up");
    const summaries = getAllByTestId("split-summary");
    expect(summaries).toHaveLength(1);
    const rows = summaries[0].querySelectorAll(".splits__summary-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("Kelsin")).toBeVisible();
    expect(within(rows[0] as HTMLElement).getByText("Waymost")).toBeVisible();
    expect(within(rows[0] as HTMLElement).getByText("Go")).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText("TJ")).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText("Netrunner")).toBeVisible();
    expect(rows[0].querySelector("img")).toBeNull();
    expect(rows[0].querySelector(".tray-cover__blank")).not.toBeNull();
    expect(getByText("Chess")).not.toBeVisible();
  });

  it("expands to the full lists and collapses again", async () => {
    const utils = renderSplits([split(23.75)]);
    const { container, getByText, getAllByRole, queryByTestId } = utils;

    await expand(utils);
    const toggle = getAllByRole("button")[0];
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(getByText("Chess")).toBeVisible();
    expect(getByText("Kelsin")).toBeVisible();
    expect(getByText("TJ")).toBeVisible();
    expect(queryByTestId("split-summary")).toBeNull();
    const chosen = container.querySelectorAll('[aria-current="true"]');
    expect(chosen).toHaveLength(2);
    expect(chosen[0]).toHaveTextContent("Go");
    expect(chosen[1]).toHaveTextContent("Netrunner");
    expect(getAllByRole("link", { name: "Go" })[0]).toHaveAttribute(
      "href",
      "/2024/games/1",
    );

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(getByText("Chess")).not.toBeVisible();
  });

  it("expands each card independently", async () => {
    const other = split(null, 40);
    other.groups[0].players = ["Ann", "Bob"];
    const { getAllByRole } = renderSplits([split(null), other]);

    await userEvent.click(getAllByRole("button")[0]);
    const buttons = getAllByRole("button", { hidden: true });
    expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
    expect(buttons[1]).toHaveAttribute("aria-expanded", "false");
  });

  it("normalizes the headline and difference against the individual max", () => {
    const { getByText } = renderWithMantine(
      <SplitSuggestions
        splits={[split(-5, 25)]}
        year="2024"
        individualMax={50}
      />,
    );
    expect(getByText(/50\.0 per player/)).toBeVisible();
    expect(getByText("-10.0")).toHaveClass("splits__delta--down");
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

  it("shows the picked game's cover in the summary and every cover when expanded", async () => {
    const s = split(null);
    s.groups[0].games[0] = game("Go", "1", 90, "/go.jpg");
    const utils = renderSplits([s]);

    const summary = utils.getAllByTestId("split-summary")[0];
    const cover = summary.querySelector("img");
    expect(cover).toHaveAttribute("src", "/go.jpg");
    expect(cover).toHaveAttribute("alt", "");

    await expand(utils);
    expect(utils.getByAltText("Go")).toHaveAttribute("src", "/go.jpg");
  });

  it("shows a blank cover for games without an image", async () => {
    const utils = renderSplits([split(null)]);
    const summary = utils.getAllByTestId("split-summary")[0];
    expect(summary.querySelectorAll(".tray-cover__blank")).toHaveLength(2);
    expect(summary.querySelector("img")).toBeNull();

    await expand(utils);
    expect(utils.container.querySelectorAll(".tray-cover__blank")).toHaveLength(
      4,
    );
    expect(utils.container.querySelector("img")).toBeNull();
  });

  it("omits the summary game when the picked game is missing", () => {
    const s = split(null);
    s.groups[0].picked = "Missing";
    const { getAllByTestId } = renderSplits([s]);
    const row = getAllByTestId("split-summary")[0].querySelector(
      ".splits__summary-row",
    ) as HTMLElement;
    expect(row.querySelector(".tray-cover")).toBeNull();
    expect(row.querySelector("a")).toBeNull();
  });
});
