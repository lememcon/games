import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import VetoToggle from "@/components/VetoToggle";
import { renderWithMantine } from "@/test/utils";

describe("VetoToggle", () => {
  it("offers Not for me when the game is not vetoed", () => {
    const { getByRole } = renderWithMantine(
      <VetoToggle game="Azul" vetoed={false} onToggle={() => {}} />,
    );

    const button = getByRole("button", { name: "Veto: Azul" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("Not for me");
    expect(button).not.toHaveAttribute("aria-haspopup");
  });

  it("shows a pressed Vetoed badge once vetoed", () => {
    const { getByRole } = renderWithMantine(
      <VetoToggle game="Azul" vetoed onToggle={() => {}} />,
    );

    const button = getByRole("button", { name: "Veto: Azul" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("✓ Vetoed");
    expect(button).toHaveClass("tray-played--on");
  });

  it("fires onToggle when clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { getByRole } = renderWithMantine(
      <VetoToggle game="Azul" vetoed={false} onToggle={onToggle} />,
    );

    await user.click(getByRole("button"));

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { getByRole } = renderWithMantine(
      <VetoToggle game="Azul" vetoed={false} disabled onToggle={onToggle} />,
    );

    expect(getByRole("button")).toBeDisabled();
    await user.click(getByRole("button"));

    expect(onToggle).not.toHaveBeenCalled();
  });
});
