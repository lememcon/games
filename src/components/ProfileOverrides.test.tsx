import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MantineProvider } from "@mantine/core";

import ProfileOverrides from "@/components/ProfileOverrides";
import { renderWithMantine } from "@/test/utils";
import type { Bounds, GamesData } from "@/types";

const ov = vi.hoisted(() => ({
  state: {
    all: {} as Record<string, Record<string, { min: number; max: number }>>,
    loading: false,
    saving: false,
    error: null as string | null,
    save: vi.fn(),
    reset: vi.fn(),
  },
}));
const gm = vi.hoisted(() => ({
  state: { games: {} as GamesData, loading: false, error: false },
}));
vi.mock("@/hooks/usePlayerOverrides", () => ({ default: () => ov.state }));
vi.mock("@/hooks/useGames", () => ({ default: () => gm.state }));

const bounds = (min: number, max: number): { players: Bounds } => ({
  players: { min, max },
});

const render = () => renderWithMantine(<ProfileOverrides discordId="d1" />);

describe("ProfileOverrides", () => {
  beforeEach(() => {
    Object.assign(ov.state, {
      all: { d1: { "1": { min: 3, max: 4 } } },
      loading: false,
      saving: false,
      error: null,
    });
    ov.state.save.mockReset().mockResolvedValue(undefined);
    ov.state.reset.mockReset();
    Object.assign(gm.state, {
      games: {
        "1": { name: "Catan", ...bounds(2, 6) },
        "2": { name: "Azul", ...bounds(2, 4) },
        "3": { name: "NoRange" },
      } as GamesData,
      loading: false,
      error: false,
    });
  });

  it("lists rows with names and stored ranges", () => {
    render();
    expect(screen.getByText("Catan")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Minimum players for Catan" }),
    ).toHaveValue("3");
    expect(
      screen.getByRole("textbox", { name: "Maximum players for Catan" }),
    ).toHaveValue("4");
  });

  it("saves an edited row", async () => {
    render();
    const maxInput = screen.getByRole("textbox", {
      name: "Maximum players for Catan",
    });
    await userEvent.clear(maxInput);
    await userEvent.type(maxInput, "5");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(ov.state.save).toHaveBeenCalledWith(1, { min: 3, max: 5 });
  });

  it("resets a row", async () => {
    render();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(ov.state.reset).toHaveBeenCalledWith(1);
  });

  it("adds an override for a picked game", async () => {
    render();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Game to override" }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: "Azul", hidden: true }),
    );
    expect(
      screen.getByRole("textbox", { name: "New minimum players" }),
    ).toHaveValue("2");
    const maxInput = screen.getByRole("textbox", {
      name: "New maximum players",
    });
    expect(maxInput).toHaveValue("4");
    await userEvent.clear(maxInput);
    await userEvent.type(maxInput, "3");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(ov.state.save).toHaveBeenCalledWith(2, { min: 2, max: 3 });
  });

  it("refuses an out-of-range new override", async () => {
    render();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Game to override" }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: "Azul", hidden: true }),
    );
    const maxInput = screen.getByRole("textbox", {
      name: "New maximum players",
    });
    await userEvent.clear(maxInput);
    await userEvent.type(maxInput, "9");
    expect(
      screen.getByText("Must stay within 2-4 (can't widen)"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(ov.state.save).not.toHaveBeenCalled();
  });

  it("only offers unlisted games that have a player range", async () => {
    render();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Game to override" }),
    );
    expect(
      screen.getByRole("option", { name: "Azul", hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Catan", hidden: true }),
    ).toBeNull();
    expect(
      screen.queryByRole("option", { name: "NoRange", hidden: true }),
    ).toBeNull();
  });

  it("shows the empty state only once loaded", () => {
    ov.state.all = {};
    ov.state.loading = true;
    const { unmount } = render();
    expect(screen.queryByText("No player count overrides yet.")).toBeNull();
    unmount();
    ov.state.loading = false;
    render();
    expect(screen.getByText("No player count overrides yet.")).toBeVisible();
  });

  it("renders a stored row without a known range read-only", async () => {
    ov.state.all = { d1: { "3": { min: 2, max: 3 } } };
    render();
    expect(screen.getByText("NoRange")).toBeInTheDocument();
    expect(screen.getByText("2-3")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /Minimum players for/ }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Reset NoRange" }),
    );
    expect(ov.state.reset).toHaveBeenCalledWith(3);
  });

  it("shows no rows while games load", () => {
    gm.state.loading = true;
    render();
    expect(screen.queryByText("Catan")).toBeNull();
    expect(screen.queryByText("No player count overrides yet.")).toBeNull();
  });

  it("shows an alert and no editable rows when games fail", () => {
    gm.state.error = true;
    render();
    expect(screen.getByRole("alert")).toHaveTextContent("game list");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows an override error", () => {
    ov.state.error = "That range is wider than this game allows.";
    render();
    expect(screen.getByRole("alert")).toHaveTextContent("wider");
  });

  it("resets row inputs when the stored range changes", () => {
    const { rerender } = render();
    const minName = "Minimum players for Catan";
    expect(screen.getByRole("textbox", { name: minName })).toHaveValue("3");
    ov.state.all = { d1: { "1": { min: 5, max: 6 } } };
    rerender(
      <MantineProvider>
        <ProfileOverrides discordId="d1" />
      </MantineProvider>,
    );
    expect(screen.getByRole("textbox", { name: minName })).toHaveValue("5");
  });
});
