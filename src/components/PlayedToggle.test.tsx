import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PlayedToggle from "@/components/PlayedToggle";
import { renderWithMantine } from "@/test/utils";

describe("PlayedToggle", () => {
  it("offers Mark played when the game has not been played", () => {
    const { getByRole } = renderWithMantine(
      <PlayedToggle game="Azul" played={false} onToggle={() => {}} />,
    );

    const button = getByRole("button", { name: "Played: Azul" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("Mark played");
  });

  it("shows a pressed Played badge once the game has been played", () => {
    const { getByRole } = renderWithMantine(
      <PlayedToggle game="Azul" played onToggle={() => {}} />,
    );

    const button = getByRole("button", { name: "Played: Azul" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("✓ Played");
  });

  it("fires onToggle when clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { getByRole } = renderWithMantine(
      <PlayedToggle game="Azul" played={false} onToggle={onToggle} />,
    );

    await user.click(getByRole("button"));

    expect(onToggle).toHaveBeenCalledOnce();
  });
});
