import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MyVeto from "@/components/MyVeto";
import { renderWithMantine } from "@/test/utils";

const setup = (over: Partial<Parameters<typeof MyVeto>[0]> = {}) => {
  const onVeto = vi.fn();
  const onYearVeto = vi.fn();
  renderWithMantine(
    <MyVeto
      game="Azul"
      year="2026"
      vetoed={false}
      yearVetoed={false}
      savingVeto={false}
      savingYear={false}
      error={null}
      onVeto={onVeto}
      onYearVeto={onYearVeto}
      {...over}
    />,
  );
  return { onVeto, onYearVeto };
};

const opener = () => screen.getByRole("button", { name: "Veto: Azul" });

describe("MyVeto", () => {
  it.each([
    [false, false, "You have not vetoed this game."],
    [true, false, "Vetoed for every year."],
    [false, true, "Skipped for 2026."],
    [true, true, "Vetoed for every year and skipped for 2026."],
  ])("states %s/%s as %s", (vetoed, yearVetoed, line) => {
    setup({ vetoed, yearVetoed });
    expect(screen.getByText(line)).toBeInTheDocument();
  });

  it("mounts the dialog only while open", async () => {
    setup();
    expect(screen.getByText(/linked to your account/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(opener());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener()).toHaveFocus();
  });

  it("vetoes for every year through the dialog", async () => {
    const { onVeto, onYearVeto } = setup();
    await userEvent.click(opener());
    await userEvent.click(screen.getByRole("button", { name: /every year/ }));
    expect(onVeto).toHaveBeenCalledWith(true);
    expect(onYearVeto).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears both kinds through the dialog", async () => {
    const { onVeto, onYearVeto } = setup({ vetoed: true, yearVetoed: true });
    await userEvent.click(opener());
    await userEvent.click(
      screen.getByRole("button", { name: "Remove: not for me" }),
    );
    await userEvent.click(opener());
    await userEvent.click(
      screen.getByRole("button", { name: "Remove: not in 2026" }),
    );
    expect(onVeto).toHaveBeenCalledWith(false);
    expect(onYearVeto).toHaveBeenCalledWith(false);
  });

  it("is disabled while either scope saves and shows an error", () => {
    setup({ savingYear: true, error: "Nope" });
    expect(opener()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Nope");
  });

  it("is disabled while the every-year scope saves", () => {
    setup({ savingVeto: true });
    expect(opener()).toBeDisabled();
  });
});
