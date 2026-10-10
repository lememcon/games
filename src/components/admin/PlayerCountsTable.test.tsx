import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import PlayerCountsTable from "@/components/admin/PlayerCountsTable";
import { renderWithMantine } from "@/test/utils";
import type { GamePlayersRow } from "@/types";

const games: GamePlayersRow[] = [
  { bggId: 1, name: "Root", bgg: { min: 2, max: 6 }, override: null },
  {
    bggId: 2,
    name: "Wingspan",
    bgg: { min: 1, max: 5 },
    override: { min: 2, max: 4 },
  },
  { bggId: 3, name: "Mystery", bgg: null, override: null },
];

const setup = (
  props: Partial<ComponentProps<typeof PlayerCountsTable>> = {},
) => {
  const onSave = vi.fn();
  const onReset = vi.fn();
  renderWithMantine(
    <PlayerCountsTable
      games={games}
      saving={new Set()}
      errors={{}}
      onSave={onSave}
      onReset={onReset}
      {...props}
    />,
  );
  return { onSave, onReset, user: userEvent.setup() };
};

const save = (name: string) =>
  screen.getByRole("button", { name: `Save ${name}` });
const min = (name: string) =>
  screen.getByLabelText(`Minimum players for ${name}`);
const max = (name: string) =>
  screen.getByLabelText(`Maximum players for ${name}`);

describe("PlayerCountsTable", () => {
  it("shows BGG's range and the current override", () => {
    setup();
    expect(screen.getByText("2-6")).toBeInTheDocument();
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(min("Wingspan")).toHaveValue("2");
    expect(max("Wingspan")).toHaveValue("4");
    expect(min("Root")).toHaveValue("");
    expect(screen.getAllByText("Overridden")).toHaveLength(1);
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("saves a valid new range", async () => {
    const { onSave, user } = setup();
    expect(save("Root")).toBeDisabled();
    await user.type(min("Root"), "4");
    await user.type(max("Root"), "4");
    await user.click(save("Root"));
    expect(onSave).toHaveBeenCalledWith(1, { min: 4, max: 4 });
  });

  it("disables Save for an unchanged override", () => {
    setup();
    expect(save("Wingspan")).toBeDisabled();
  });

  it("disables Save when a game with no override is set to BGG's range", async () => {
    const { user } = setup();
    await user.type(min("Root"), "2");
    await user.type(max("Root"), "6");
    expect(save("Root")).toBeDisabled();
    await user.clear(max("Root"));
    await user.type(max("Root"), "5");
    expect(save("Root")).toBeEnabled();
  });

  it("explains an invalid range and blocks saving", async () => {
    const { onSave, user } = setup();
    await user.type(min("Root"), "5");
    expect(screen.getByText("Enter both counts")).toBeInTheDocument();
    expect(min("Root")).toHaveAttribute("aria-invalid", "true");
    expect(max("Root")).toHaveAttribute("aria-invalid", "true");
    await user.type(max("Root"), "3");
    const message = screen.getByText("Min can't exceed max");
    expect(message).toHaveAttribute("id");
    expect(min("Root")).toHaveAttribute("aria-describedby", message.id);
    expect(max("Root")).toHaveAttribute("aria-describedby", message.id);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(save("Root")).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("warns when the range is wider than BGG's", async () => {
    const { user } = setup();
    await user.type(min("Root"), "1");
    await user.type(max("Root"), "6");
    expect(screen.getByText("Wider than BGG's range")).toBeInTheDocument();
    await user.clear(min("Root"));
    await user.type(min("Root"), "2");
    expect(screen.queryByText("Wider than BGG's range")).toBeNull();
  });

  it("resets only an overridden game", async () => {
    const { onReset, user } = setup();
    expect(screen.getByRole("button", { name: "Reset Root" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reset Wingspan" }));
    expect(onReset).toHaveBeenCalledWith(2);
  });

  it("shows a row error and a saving state", () => {
    setup({
      errors: { 1: "Something went wrong. Try again." },
      saving: new Set([2]),
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(
      screen.getByRole("button", { name: "Reset Wingspan" }),
    ).toBeDisabled();
  });

  it("filters by name or id", async () => {
    const { user } = setup();
    const filter = screen.getByLabelText("Filter games by name or id");
    await user.type(filter, "wing");
    expect(screen.queryByText("Root")).toBeNull();
    expect(screen.getByText("Wingspan")).toBeInTheDocument();
    await user.clear(filter);
    await user.type(filter, "zzz");
    expect(screen.getByText("No games match.")).toBeInTheDocument();
  });
});
