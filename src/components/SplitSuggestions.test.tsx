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
  playedBy: [],
});

const scored = (
  g: SelectedGame,
  scores: [string, number, number][],
): SelectedGame => ({
  ...g,
  players: Object.fromEntries(
    scores.map(([name, rank, score]) => [name, { name, rank, score }]),
  ),
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

  it("names the least happy member and score on expanded rows", async () => {
    const s = split(null);
    s.groups[0].games[0] = scored(s.groups[0].games[0], [
      ["Kelsin", 1, 90],
      ["Waymost", 2, 60],
    ]);
    const utils = renderSplits([s]);
    await expand(utils);
    const rows = utils.container.querySelectorAll(".tray-row");
    const lines = Array.from(rows).filter((r) =>
      /least happy:/.test(r.textContent ?? ""),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent("least happy: Waymost (60.0)");
  });

  it("picks the worst rank among three group players", async () => {
    const s = split(null);
    s.groups[0].players = ["Kelsin", "Waymost", "Ann"];
    s.groups[0].games[0] = scored(s.groups[0].games[0], [
      ["Kelsin", 2, 80],
      ["Waymost", 5, 40],
      ["Ann", 3, 70],
    ]);
    const utils = renderSplits([s]);
    await expand(utils);
    const row = utils.container.querySelector(".splits__row--chosen");
    expect(row).toHaveTextContent("least happy: Waymost (40.0)");
  });

  it("omits the line with fewer than two scorers", async () => {
    const s = split(null);
    s.groups[0].games[0] = scored(s.groups[0].games[0], [["Kelsin", 1, 90]]);
    const utils = renderSplits([s]);
    await expand(utils);
    expect(utils.queryByText(/least happy:/)).toBeNull();
    expect(utils.queryByTestId("split-least-happy")).toBeNull();
  });

  it("hides the least happy line on the collapsed summary", () => {
    const s = split(null);
    s.groups[0].games[0] = scored(s.groups[0].games[0], [
      ["Kelsin", 1, 90],
      ["Waymost", 2, 60],
    ]);
    const { getByTestId } = renderSplits([s]);
    expect(getByTestId("split-summary")).not.toHaveTextContent(/least happy:/);
  });

  it("keeps players, cover and game link in summary rows without least happy", () => {
    const s = split(null);
    s.groups[0].games[0] = scored(s.groups[0].games[0], [
      ["Kelsin", 1, 90],
      ["Waymost", 2, 60],
    ]);
    s.groups[1].games[0] = scored(s.groups[1].games[0], [
      ["Lemem", 2, 70],
      ["TJ", 1, 85],
    ]);
    const { getByTestId } = renderSplits([s]);
    const rows = getByTestId("split-summary").querySelectorAll(
      ".splits__summary-row",
    );
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row).not.toHaveTextContent(/least happy:/);
      expect(row.querySelector(".tray-cover")).not.toBeNull();
      expect(row.querySelector("a")).not.toBeNull();
    });
    expect(rows[0]).toHaveTextContent("Kelsin");
    expect(rows[1]).toHaveTextContent("Lemem");
  });

  it("shows group rank on expanded cards only", async () => {
    const s = split(null);
    s.groups[0].games[0] = scored(s.groups[0].games[0], [
      ["Kelsin", 4, 90],
      ["Waymost", 2, 60],
    ]);
    const utils = renderSplits([s]);
    expect(utils.getByTestId("split-summary")).not.toHaveTextContent(
      "group rank",
    );
    await expand(utils);
    expect(utils.getAllByText(/group rank:/)[0]).toHaveTextContent(
      "group rank: #1 Kelsin (global 4) · #2 Waymost (global 2)",
    );
  });

  it("shows the split-wide least happy line once, collapsed and expanded", async () => {
    const s = split(null);
    s.groups[0].games[0] = scored(s.groups[0].games[0], [
      ["Kelsin", 1, 90],
      ["Waymost", 2, 60],
    ]);
    s.groups[1].games[0] = scored(s.groups[1].games[0], [
      ["Lemem", 3, 70],
      ["TJ", 1, 85],
    ]);
    const utils = renderSplits([s]);
    const line = utils.getByTestId("split-least-happy");
    expect(line).toHaveTextContent("least happy: Lemem (70.0)");
    expect(utils.getByTestId("split-summary")).not.toContainElement(line);
    expect(utils.getByTestId("split-summary")).not.toHaveTextContent(
      /least happy:/,
    );
    await expand(utils);
    expect(utils.getAllByTestId("split-least-happy")).toHaveLength(1);
    expect(utils.getByTestId("split-least-happy")).toHaveTextContent(
      "least happy: Lemem (70.0)",
    );
  });
});
