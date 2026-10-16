import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TopPicks from "@/components/TopPicks";
import { renderWithMantine } from "@/test/utils";
import type { PlayerGameScore } from "@/types";

const row = (
  bgg_id: number,
  game: string,
  player: string,
  rank: number,
  extra: Partial<PlayerGameScore> = {},
): PlayerGameScore => ({
  bgg_id,
  game,
  player,
  score: 10,
  rank,
  discord_id: player.toLowerCase(),
  ...extra,
});

const scores = [
  row(1, "Alpha", "Alice", 1, { discord_image: "https://x/alice.png" }),
  row(1, "Alpha", "Bob", 3),
  row(2, "Beta", "Bob", 2),
  row(3, "Gamma", "Alice", 1),
];

const show = (
  rows = scores,
  allPlayed: Record<string, Record<string, 1>> = { alice: { "3": 1 } },
  games = { "1": { image: "https://x/alpha.png" } },
) =>
  renderWithMantine(
    <TopPicks year="2025" scores={rows} allPlayed={allPlayed} games={games} />,
  );

describe("TopPicks", () => {
  it("groups games into tiers with every owner and their rank", () => {
    show();

    expect(screen.getByRole("heading", { name: "#1 picks" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Top 2" })).toBeVisible();
    // Gamma was played by its only owner.
    expect(screen.queryByText("Gamma")).toBeNull();

    const alpha = screen.getByRole("link", { name: "Alpha" });
    expect(alpha).toHaveAttribute("href", "/2025/games/1");
    const owners = within(alpha.closest("li")!).getByRole("list", {
      name: "Picked by",
    });
    expect(within(owners).getByText("Alice's #1")).toBeInTheDocument();
    expect(within(owners).getByText("Bob's #3")).toBeInTheDocument();
  });

  it("shows the cover and member avatars", () => {
    const { container } = show();

    expect(container.querySelector(".tray-cover img")).toHaveAttribute(
      "src",
      "https://x/alpha.png",
    );
    expect(container.querySelector(".tray-cover__blank")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Alice" })).toHaveAttribute(
      "href",
      "/players/alice",
    );
    expect(
      container.querySelector("img[src='https://x/alice.png']"),
    ).not.toBeNull();
  });

  it("strikes through an owner who played the game", () => {
    show(scores, { alice: { "1": 1 } });

    expect(screen.getByRole("heading", { name: "Top 2" })).toBeVisible();
    const played = screen.getByText("Alice's #1, played");
    expect(played.closest("li")).toHaveStyle("text-decoration: line-through");
  });

  it("links back to the year", () => {
    show();

    expect(screen.getByRole("link", { name: /Back to 2025/ })).toHaveAttribute(
      "href",
      "/2025",
    );
  });

  it("says so when nothing is left unplayed", () => {
    show(scores, { alice: { "1": 1, "3": 1 }, bob: { "1": 1, "2": 1 } });

    expect(screen.getByText("No unplayed top picks")).toBeVisible();
  });

  it("explains when no score row is linked", () => {
    show([row(1, "Alpha", "Alice", 1, { discord_id: undefined })]);

    expect(
      screen.getByText(
        "No players are linked to members for this year, so there are no top picks to show",
      ),
    ).toBeVisible();
    expect(screen.queryByText("No unplayed top picks")).toBeNull();
  });
});
