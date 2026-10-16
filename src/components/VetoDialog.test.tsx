import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import VetoDialog from "@/components/VetoDialog";
import { renderWithMantine } from "@/test/utils";

const setup = (over: Partial<Parameters<typeof VetoDialog>[0]> = {}) => {
  const fns = {
    onVeto: vi.fn(),
    onYearVeto: vi.fn(),
    onClose: vi.fn(),
  };
  renderWithMantine(
    <VetoDialog
      game="Wingspan"
      year="2026"
      vetoed={false}
      yearVetoed={false}
      savingVeto={false}
      savingYear={false}
      {...fns}
      {...over}
    />,
  );
  return fns;
};

const everyYear = () =>
  screen.getByRole("button", { name: /not for me|remove: not for me/i });
const thisYear = () => screen.getByRole("button", { name: /not in 2026/i });

describe("VetoDialog", () => {
  it("titles the dialog with the game and offers both scopes", () => {
    setup();

    expect(screen.getByRole("dialog")).toHaveAccessibleName('Veto "Wingspan"');
    expect(everyYear()).toHaveTextContent("Not for me · every year");
    expect(thisYear()).toHaveTextContent("Not in 2026");
    expect(everyYear()).not.toHaveAttribute("aria-pressed");
    expect(thisYear()).not.toHaveAttribute("aria-pressed");
  });

  it("vetoes for every year then closes", async () => {
    const { onVeto, onYearVeto, onClose } = setup();

    await userEvent.click(everyYear());

    expect(onVeto).toHaveBeenCalledWith(true);
    expect(onYearVeto).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("vetoes for the year then closes", async () => {
    const { onVeto, onYearVeto, onClose } = setup();

    await userEvent.click(thisYear());

    expect(onYearVeto).toHaveBeenCalledWith(true);
    expect(onVeto).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers removal for a scope that is set, independently", async () => {
    const { onVeto, onYearVeto, onClose } = setup({ vetoed: true });

    expect(everyYear()).toHaveTextContent("Remove: not for me");
    expect(thisYear()).toHaveTextContent("Not in 2026");
    await userEvent.click(everyYear());
    expect(onVeto).toHaveBeenCalledWith(false);
    expect(onYearVeto).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("removes a year veto", async () => {
    const { onYearVeto } = setup({ yearVetoed: true });

    expect(everyYear()).toHaveTextContent("Not for me · every year");
    expect(thisYear()).toHaveTextContent("Remove: not in 2026");
    await userEvent.click(thisYear());
    expect(onYearVeto).toHaveBeenCalledWith(false);
  });

  it("disables a scope while it saves", () => {
    setup({ savingVeto: true });
    expect(everyYear()).toBeDisabled();
    expect(thisYear()).toBeEnabled();
  });

  it("disables the year scope while it saves", () => {
    setup({ savingYear: true });
    expect(everyYear()).toBeEnabled();
    expect(thisYear()).toBeDisabled();
  });

  it("only closes on Cancel", async () => {
    const { onVeto, onYearVeto, onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onVeto).not.toHaveBeenCalled();
    expect(onYearVeto).not.toHaveBeenCalled();
  });
});
