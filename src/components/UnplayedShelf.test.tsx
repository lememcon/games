import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UnplayedShelf from "@/components/UnplayedShelf";
import { renderWithMantine } from "@/test/utils";
import type { UnplayedGame } from "@/types";

const state = vi.hoisted(() => ({ games: [] as UnplayedGame[] }));
vi.mock("@/hooks/useUnplayedGames", () => ({ default: () => state.games }));

const games = { "1": { image: "https://example.com/1.jpg" } };

beforeEach(() => {
  state.games = [
    { bgg_id: 1, name: "Alpha" },
    { bgg_id: 2, name: "Beta" },
  ];
});

describe("UnplayedShelf", () => {
  it("shows the count and starts collapsed", () => {
    renderWithMantine(<UnplayedShelf games={games} />);
    const toggle = screen.getByRole("button", { name: "Never played (2)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Alpha")).not.toBeVisible();
  });

  it("lists the games once opened", async () => {
    renderWithMantine(<UnplayedShelf games={games} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Never played (2)" }),
    );
    expect(screen.getByText("Alpha")).toBeVisible();
    expect(screen.getByText("Beta")).toBeVisible();
  });

  it("shows a cover for a game with an image and a blank box otherwise", () => {
    const { container } = renderWithMantine(<UnplayedShelf games={games} />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("src", "https://example.com/1.jpg");
    expect(container.querySelectorAll(".tray-cover__blank")).toHaveLength(1);
  });

  it("renders nothing when the list is empty", () => {
    state.games = [];
    renderWithMantine(<UnplayedShelf games={games} />);
    expect(screen.queryByText(/Never played/)).toBeNull();
  });
});
