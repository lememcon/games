import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MarkPlayedDialog from "@/components/MarkPlayedDialog";
import type { MarkPlayedOption } from "@/lib/markPlayed";
import { renderWithMantine } from "@/test/utils";

const options: MarkPlayedOption[] = [
  { name: "Alice", discordId: "1", disabled: false },
  { name: "Bob", discordId: "2", disabled: false },
  { name: "Cara", discordId: null, disabled: true, reason: "no account" },
  {
    name: "Eve",
    discordId: "5",
    disabled: true,
    reason: "already played",
  },
];

const setup = (onConfirm = vi.fn().mockResolvedValue(undefined)) => {
  const onClose = vi.fn();
  renderWithMantine(
    <MarkPlayedDialog
      game="Azul"
      year="2024"
      selfId="1"
      options={options}
      initialSelected={["1"]}
      onClose={onClose}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onClose };
};

describe("MarkPlayedDialog", () => {
  it("lists the players with the member preselected and the rest disabled", async () => {
    setup();

    expect(
      await screen.findByRole("dialog", {
        name: 'Mark "Azul" played \u00b7 2024',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alice (you)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Bob" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "Cara \u00b7 no account" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Eve \u00b7 already played" }),
    ).toBeDisabled();
  });

  it("confirms the selected members", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await user.click(await screen.findByRole("button", { name: "Bob" }));
    await user.click(screen.getByRole("button", { name: "Mark 2 played" }));

    expect(onConfirm).toHaveBeenCalledWith(["1", "2"]);
  });

  it("disables confirm when nobody is selected", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(
      await screen.findByRole("button", { name: "Alice (you)" }),
    );

    expect(
      screen.getByRole("button", { name: "Mark 0 played" }),
    ).toBeDisabled();
  });

  it("shows an error and stays open when saving fails", async () => {
    const user = userEvent.setup();
    const { onClose } = setup(vi.fn().mockRejectedValue(new Error("x")));

    await user.click(
      await screen.findByRole("button", { name: "Mark 1 played" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark 1 played" }),
      ).toBeEnabled(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on Cancel", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
  });
});
