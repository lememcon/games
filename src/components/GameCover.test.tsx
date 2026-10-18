import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import GameCover from "@/components/GameCover";
import { renderWithMantine } from "@/test/utils";

const cover = (c: HTMLElement) => c.querySelector("img");
const blank = (c: HTMLElement) => c.querySelector(".tray-cover__blank");

describe("GameCover", () => {
  it("shows a lazy decorative image for an https cover", () => {
    const { container } = renderWithMantine(
      <GameCover image="https://example.com/r.jpg" />,
    );
    const img = cover(container)!;
    expect(img).toHaveAttribute("src", "https://example.com/r.jpg");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("prefers the server cover over the image URL", () => {
    const { container } = renderWithMantine(
      <GameCover
        image="https://example.com/a.jpg"
        cover="https://cdn.example.com/7.jpg"
      />,
    );
    expect(cover(container)).toHaveAttribute(
      "src",
      "https://cdn.example.com/7.jpg",
    );
  });

  it("shows a blank box without a cover", () => {
    const { container } = renderWithMantine(<GameCover />);
    expect(cover(container)).toBeNull();
    expect(blank(container)).not.toBeNull();
  });

  it("falls back to the blank box when the image fails", () => {
    const { container } = renderWithMantine(
      <GameCover image="https://example.com/r.jpg" />,
    );
    fireEvent.error(cover(container)!);
    expect(cover(container)).toBeNull();
    expect(blank(container)).not.toBeNull();
  });
});
