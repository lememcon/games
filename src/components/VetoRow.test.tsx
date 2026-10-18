import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import VetoRow from "@/components/VetoRow";
import { renderWithMantine } from "@/test/utils";

const cover = (container: HTMLElement) => container.querySelector("img");
const blank = (container: HTMLElement) =>
  container.querySelector(".tray-cover__blank");

describe("VetoRow", () => {
  it("shows a lazy decorative image for an https cover", () => {
    const { container } = renderWithMantine(
      <VetoRow bggId={1} name="Root" image="https://example.com/r.jpg" />,
    );
    const img = cover(container)!;
    expect(img).toHaveAttribute("src", "https://example.com/r.jpg");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("width", "40");
  });

  it("prefers the mirrored cover over the image URL", () => {
    const { container } = renderWithMantine(
      <VetoRow
        bggId={7}
        name="Azul"
        image="https://example.com/a.jpg"
        cover="https://cdn.example.com/7.webp"
      />,
    );
    expect(cover(container)).toHaveAttribute(
      "src",
      "https://cdn.example.com/7.webp",
    );
  });

  it("ignores a non-https mirrored cover", () => {
    const { container } = renderWithMantine(
      <VetoRow
        bggId={1}
        name="Root"
        image="https://example.com/r.jpg"
        cover="http://cdn.example.com/1.webp"
      />,
    );
    expect(cover(container)).toHaveAttribute(
      "src",
      "https://example.com/r.jpg",
    );
  });

  it("shows a blank box without a cover", () => {
    const { container } = renderWithMantine(<VetoRow bggId={1} name="Root" />);
    expect(cover(container)).toBeNull();
    expect(blank(container)).not.toBeNull();
  });

  it("shows a blank box for a custom image with no https URL", () => {
    const { container } = renderWithMantine(
      <VetoRow bggId={1} name="Root" image="custom" />,
    );
    expect(cover(container)).toBeNull();
    expect(blank(container)).not.toBeNull();
  });

  it("falls back to the blank box when the image fails", () => {
    const { container } = renderWithMantine(
      <VetoRow bggId={1} name="Root" image="https://example.com/r.jpg" />,
    );
    fireEvent.error(cover(container)!);
    expect(cover(container)).toBeNull();
    expect(blank(container)).not.toBeNull();
  });

  it("shows the name with no button when read-only", () => {
    renderWithMantine(<VetoRow bggId={1} name="Root" />);
    expect(screen.getByText("Root")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("links a permanent veto to the legacy game redirect", () => {
    renderWithMantine(<VetoRow bggId={1} name="Root" />);
    expect(screen.getByRole("link", { name: "Root" })).toHaveAttribute(
      "href",
      "/games/1",
    );
  });

  it("links a year veto to that year's game page", () => {
    renderWithMantine(<VetoRow bggId={1} name="Root" year={2024} />);
    expect(screen.getByRole("link", { name: "Root" })).toHaveAttribute(
      "href",
      "/2024/games/1",
    );
  });

  it("falls back to the game id and wraps long names", () => {
    renderWithMantine(<VetoRow bggId={9} name={null} />);
    expect(screen.getByText("Game 9")).toHaveStyle({
      overflowWrap: "anywhere",
    });
    expect(screen.getByRole("link", { name: "Game 9" })).toHaveAttribute(
      "href",
      "/games/9",
    );
  });

  it("renders an Undo button with its label", async () => {
    const onClick = vi.fn();
    renderWithMantine(
      <VetoRow
        bggId={1}
        name="Root"
        undo={{ label: "Undo veto of Root", disabled: false, onClick }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Undo veto of Root" }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disables the Undo button", () => {
    renderWithMantine(
      <VetoRow
        bggId={1}
        name="Root"
        undo={{ label: "Undo veto of Root", disabled: true, onClick: vi.fn() }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Undo veto of Root" }),
    ).toBeDisabled();
  });
});
