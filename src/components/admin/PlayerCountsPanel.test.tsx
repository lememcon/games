import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PlayerCountsPanel from "@/components/admin/PlayerCountsPanel";
import { renderWithMantine } from "@/test/utils";

const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/hooks/useGamePlayers", () => ({ default: () => hook.value }));

const setHook = (over: Record<string, unknown> = {}) => {
  hook.value = {
    games: [
      { bggId: 1, name: "Root", bgg: { min: 2, max: 6 }, override: null },
      {
        bggId: 2,
        name: "Wingspan",
        bgg: { min: 1, max: 5 },
        override: { min: 2, max: 4 },
      },
    ],
    loading: false,
    error: false,
    saving: new Set<number>(),
    rowErrors: {},
    save: vi.fn(),
    reset: vi.fn(),
    ...over,
  };
};

describe("PlayerCountsPanel", () => {
  it("shows a loading state", () => {
    setHook({ loading: true });
    renderWithMantine(<PlayerCountsPanel />);
    expect(screen.getByText("Loading player counts...")).toBeInTheDocument();
  });

  it("shows a load error", () => {
    setHook({ error: true });
    renderWithMantine(<PlayerCountsPanel />);
    expect(screen.getByText("Couldn't load player counts")).toBeInTheDocument();
  });

  it("summarizes how many games are restricted", () => {
    setHook();
    renderWithMantine(<PlayerCountsPanel />);
    expect(
      screen.getByRole("heading", { name: "Player counts" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 of 2\s+games restricted/)).toBeInTheDocument();
    expect(screen.getByText("Root")).toBeInTheDocument();
  });

  it("says so when there are no games", () => {
    setHook({ games: [] });
    renderWithMantine(<PlayerCountsPanel />);
    expect(screen.getByText(/No games yet/)).toBeInTheDocument();
  });
});
