import { describe, expect, it } from "vitest";

import GameDetailHeader from "@/components/GameDetailHeader";
import { renderWithMantine } from "@/test/utils";

describe("GameDetailHeader", () => {
  it("renders the name, player range, and BGG link", () => {
    const { container, getByRole } = renderWithMantine(
      <GameDetailHeader
        name="Root"
        bounds={{ min: 2, max: 4 }}
        id="237182"
        image={null}
      />,
    );

    expect(getByRole("heading", { name: "Root" })).toBeInTheDocument();
    expect(container.textContent).toContain("Players:");
    expect(container.textContent).toContain("2-4");
    const link = getByRole("link", { name: "BGG Page" });
    expect(link).toHaveAttribute(
      "href",
      "https://boardgamegeek.com/boardgame/237182/",
    );
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the restriction and what BGG lists", () => {
    const { container } = renderWithMantine(
      <GameDetailHeader
        name="Root"
        bounds={{ min: 4, max: 4 }}
        original={{ min: 2, max: 6 }}
        id="237182"
        image={null}
      />,
    );

    expect(container.textContent).toContain("Players:");
    expect(container.textContent).toContain("Restricted");
    expect(container.textContent).toContain("BGG lists 2-6");
  });

  it("omits the player range when bounds is null", () => {
    const { container } = renderWithMantine(
      <GameDetailHeader name="Root" bounds={null} id="237182" image={null} />,
    );

    expect(container.textContent).not.toContain("Players:");
  });

  it("renders the image when provided", () => {
    const { getByRole } = renderWithMantine(
      <GameDetailHeader
        name="Root"
        bounds={null}
        id="237182"
        image="root.jpg"
      />,
    );

    expect(getByRole("img")).toHaveAttribute("src", "root.jpg");
  });
});
