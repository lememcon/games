import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PublicProfile from "@/components/PublicProfile";
import type { ProfileState } from "@/hooks/useProfile";
import { renderWithMantine } from "@/test/utils";
import type { Profile } from "@/types";

const hook = vi.hoisted(() => ({
  state: { status: "loading" } as unknown,
  useProfile: vi.fn(),
}));
vi.mock("@/hooks/useProfile", () => ({
  default: (id: string) => {
    hook.useProfile(id);
    return hook.state;
  },
}));

const set = (state: ProfileState) => {
  hook.state = state;
};
const base: Profile = {
  discordId: "5",
  name: "Kel",
  image: null,
  linkedPlayers: ["kelsin"],
  stats: {
    games: 42,
    wins: 11,
    winRate: 0.26,
    avgRank: 2.4,
    podiums: 19,
    mostPlayed: [
      { bggId: 266192, game: "Wingspan", plays: 9, bestRank: 1, bestScore: 87 },
      { bggId: 230802, game: "Azul", plays: 7, bestRank: 2, bestScore: 74 },
    ],
    topByYear: [
      {
        year: 2025,
        total: 1,
        games: [{ bggId: 9, game: "Root", rank: 1, score: 87 }],
      },
    ],
  },
};

describe("PublicProfile", () => {
  it("requests the profile for its id", () => {
    set({ status: "loading" });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(hook.useProfile).toHaveBeenCalledWith("5");
  });

  it("shows nothing but a loader while loading", () => {
    set({ status: "loading" });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("explains a missing profile", () => {
    set({ status: "not_found" });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.getByText("Profile not found")).toBeInTheDocument();
  });

  it("explains a load failure", () => {
    set({ status: "error" });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.getByText("Couldn't load this profile")).toBeInTheDocument();
  });

  it("shows the name, stat tiles and most played games", () => {
    set({ status: "ready", profile: base });
    renderWithMantine(<PublicProfile discordId="5" />);

    expect(screen.getByRole("heading", { name: "Kel" })).toBeInTheDocument();
    for (const text of ["42", "11", "26%", "2.4", "19"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Wingspan" })).toHaveAttribute(
      "href",
      "/games/266192",
    );
    expect(
      screen.getByText("9 plays, best 1st (87)", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("7 plays, best 2nd (74)", { exact: false }),
    ).toBeInTheDocument();
  });

  it("shows top games by year when there are any", () => {
    set({ status: "ready", profile: base });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.getByText("Top games by year")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2025" })).toBeInTheDocument();
  });

  it("omits top games by year when empty", () => {
    set({
      status: "ready",
      profile: { ...base, stats: { ...base.stats!, topByYear: [] } },
    });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.queryByText("Top games by year")).toBeNull();
  });

  it("says so when no scores are linked", () => {
    set({ status: "ready", profile: { ...base, stats: null } });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.getByText(/No scores are linked/)).toBeInTheDocument();
    expect(screen.queryByText("Most played")).toBeNull();
    expect(screen.queryByText("Top games by year")).toBeNull();
  });
});
