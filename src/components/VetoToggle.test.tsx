import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import VetoToggle from "@/components/VetoToggle";
import { renderWithMantine } from "@/test/utils";

const setup = (over: Partial<Parameters<typeof VetoToggle>[0]> = {}) => {
  const onOpen = vi.fn();
  const view = renderWithMantine(
    <VetoToggle
      game="Azul"
      year="2026"
      vetoed={false}
      yearVetoed={false}
      onOpen={onOpen}
      {...over}
    />,
  );
  return { ...view, onOpen, button: view.getByRole("button") };
};

describe("VetoToggle", () => {
  it("offers Not for me when nothing is set", () => {
    const { button } = setup();

    expect(button).toHaveAccessibleName("Veto: Azul");
    expect(button).toHaveTextContent("Not for me…");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).not.toHaveAttribute("aria-pressed");
    expect(button).not.toHaveClass("tray-played--on");
  });

  it("shows Vetoed for an every-year veto", () => {
    const { button } = setup({ vetoed: true });

    expect(button).toHaveTextContent("✓ Vetoed");
    expect(button).toHaveClass("tray-played--on");
  });

  it("shows Skipped with the year for a year-only veto", () => {
    const { button } = setup({ yearVetoed: true });

    expect(button).toHaveTextContent("✓ Skipped 2026");
    expect(button).toHaveClass("tray-played--on");
  });

  it("prefers Vetoed when both are set", () => {
    const { button } = setup({ vetoed: true, yearVetoed: true });

    expect(button).toHaveTextContent("✓ Vetoed");
  });

  it("fires onOpen when clicked", async () => {
    const { button, onOpen } = setup();

    await userEvent.setup().click(button);

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", async () => {
    const { button, onOpen } = setup({ disabled: true });

    expect(button).toBeDisabled();
    await userEvent.setup().click(button);

    expect(onOpen).not.toHaveBeenCalled();
  });
});
