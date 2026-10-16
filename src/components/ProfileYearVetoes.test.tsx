import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfileYearVetoes from "@/components/ProfileYearVetoes";
import { renderWithMantine } from "@/test/utils";

const hook = vi.hoisted(() => ({
  state: {
    vetoes: [] as { year: number; bggId: number; name: string | null }[],
    loading: false,
    saving: false,
    error: null as string | null,
    clear: vi.fn(),
  },
}));
vi.mock("@/hooks/useMyYearVetoes", () => ({ default: () => hook.state }));

describe("ProfileYearVetoes", () => {
  beforeEach(() => {
    Object.assign(hook.state, {
      vetoes: [],
      loading: false,
      saving: false,
      error: null,
    });
    hook.state.clear.mockReset();
  });

  it("explains the scope of a year veto", () => {
    renderWithMantine(<ProfileYearVetoes />);
    expect(screen.getByText(/for that year only/)).toBeVisible();
  });

  it("shows an empty state, but not while loading", () => {
    const { unmount } = renderWithMantine(<ProfileYearVetoes />);
    expect(
      screen.getByText("You haven't vetoed any games for a single year."),
    ).toBeVisible();
    unmount();
    hook.state.loading = true;
    renderWithMantine(<ProfileYearVetoes />);
    expect(screen.queryByText(/haven't vetoed/)).toBeNull();
  });

  it("groups by year, newest first, and undoes one for its year", async () => {
    hook.state.vetoes = [
      { year: 2026, bggId: 1, name: "Brass" },
      { year: 2026, bggId: 9, name: null },
      { year: 2025, bggId: 2, name: "Wingspan" },
    ];
    renderWithMantine(<ProfileYearVetoes />);
    expect(
      screen
        .getAllByRole("heading", { name: /^Vetoed in / })
        .map((h) => h.textContent),
    ).toEqual(["Vetoed in 2026", "Vetoed in 2025"]);
    expect(screen.getByText("Game 9")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Undo 2025 veto of Wingspan" }),
    );
    expect(hook.state.clear).toHaveBeenCalledWith(2025, 2);
    expect(
      screen.getByRole("button", { name: "Undo 2026 veto of Game 9" }),
    ).toBeInTheDocument();
  });

  it("disables undo while saving", () => {
    hook.state.vetoes = [{ year: 2026, bggId: 1, name: "Brass" }];
    hook.state.saving = true;
    renderWithMantine(<ProfileYearVetoes />);
    expect(
      screen.getByRole("button", { name: "Undo 2026 veto of Brass" }),
    ).toBeDisabled();
  });

  it("shows an error", () => {
    hook.state.error = "Something went wrong.";
    renderWithMantine(<ProfileYearVetoes />);
    expect(screen.getByRole("alert")).toHaveTextContent("went wrong");
  });
});
