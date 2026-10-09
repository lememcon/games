import { describe, expect, it } from "vitest";

import PlayerName from "@/components/PlayerName";
import { PALETTE } from "@/lib/colors";
import { PlayerColorProvider } from "@/lib/playerColors";
import { renderWithMantine } from "@/test/utils";

// jsdom normalizes an inline hex color to rgb(), so compare against the rgb form.
const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

describe("PlayerName", () => {
  it("renders the name in the color the provider assigns", () => {
    const { getByText } = renderWithMantine(
      <PlayerColorProvider value={{ alice: PALETTE[2] }}>
        <PlayerName name="alice" />
      </PlayerColorProvider>,
    );
    expect(getByText("alice")).toHaveStyle({ color: rgb(PALETTE[2]) });
  });

  it("falls back to the first palette color for an unmapped name", () => {
    const { getByText } = renderWithMantine(<PlayerName name="ghost" />);
    expect(getByText("ghost")).toHaveStyle({ color: rgb(PALETTE[0]) });
  });

  it("links to the public profile when a discord id is given", () => {
    const { getByRole } = renderWithMantine(
      <PlayerColorProvider value={{ alice: PALETTE[2] }}>
        <PlayerName name="alice" discordId="42" />
      </PlayerColorProvider>,
    );
    const link = getByRole("link", { name: "alice" });
    expect(link).toHaveAttribute("href", "/players/42");
    expect(link).toHaveStyle({ color: rgb(PALETTE[2]) });
    expect(link).toHaveStyle({ textDecoration: "underline dotted" });
  });

  it("shows the avatar before the name of a linked player", () => {
    const { container, getByRole } = renderWithMantine(
      <PlayerName name="alice" discordId="42" image="https://x/a.png" />,
    );
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://x/a.png");
    expect(img).toHaveAttribute("alt", "");
    expect(getByRole("link", { name: "alice" })).toBeInTheDocument();
  });

  it("falls back to initials for a linked player without an image", () => {
    const { container } = renderWithMantine(
      <PlayerName name="alice" discordId="42" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("A");
  });

  it("shows no avatar for an unlinked player", () => {
    const { container } = renderWithMantine(
      <PlayerName name="alice" image="https://x/a.png" />,
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("is plain text without a discord id", () => {
    const { queryByRole, getByText } = renderWithMantine(
      <PlayerName name="alice" />,
    );
    expect(queryByRole("link")).toBeNull();
    expect(getByText("alice").getAttribute("style") ?? "").not.toContain(
      "underline",
    );
  });
});
