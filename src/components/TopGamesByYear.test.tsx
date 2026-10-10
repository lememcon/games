import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TopGamesByYear from "@/components/TopGamesByYear";
import { renderWithMantine } from "@/test/utils";
import type { YearTopGames } from "@/types";

const years: YearTopGames[] = [
  {
    year: 2026,
    total: 12,
    games: [
      { bggId: 1, game: "Wingspan", rank: 1, score: 87 },
      { bggId: 2, game: "Azul", rank: 4, score: 50 },
    ],
  },
  {
    year: 2025,
    total: 1,
    games: [{ bggId: 3, game: "Root", rank: 2, score: 74 }],
  },
];

describe("TopGamesByYear", () => {
  it("renders nothing for an empty list", () => {
    renderWithMantine(<TopGamesByYear topByYear={[]} />);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("shows a card per year with counts, places, links and scores", () => {
    renderWithMantine(<TopGamesByYear topByYear={years} />);
    expect(screen.getByRole("heading", { name: "2026" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2025" })).toBeInTheDocument();
    expect(screen.getByText("2 of 12 games")).toBeInTheDocument();
    expect(screen.getByText("1 game")).toBeInTheDocument();
    expect(screen.getByLabelText("place 1")).toHaveTextContent("1");
    expect(screen.getByLabelText("place 4")).toHaveTextContent("4");
    expect(screen.getByRole("link", { name: "Wingspan" })).toHaveAttribute(
      "href",
      "/2026/games/1",
    );
    expect(screen.getByRole("link", { name: "Root" })).toHaveAttribute(
      "href",
      "/2025/games/3",
    );
    expect(screen.getByText("87")).toBeInTheDocument();
  });

  it("notes hidden games only when the total exceeds those shown", () => {
    renderWithMantine(<TopGamesByYear topByYear={years} />);
    expect(screen.getAllByText(/more not shown/)).toHaveLength(1);
    expect(screen.getByText("+10 more not shown")).toBeInTheDocument();
  });
});
