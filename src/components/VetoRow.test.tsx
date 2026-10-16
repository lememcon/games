import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import VetoRow from "@/components/VetoRow";
import { renderWithMantine } from "@/test/utils";

describe("VetoRow", () => {
  it("shows the name with no button when read-only", () => {
    renderWithMantine(<VetoRow bggId={1} name="Root" />);
    expect(screen.getByText("Root")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("falls back to the game id and wraps long names", () => {
    renderWithMantine(<VetoRow bggId={9} name={null} />);
    expect(screen.getByText("Game 9")).toHaveStyle({
      overflowWrap: "anywhere",
    });
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
