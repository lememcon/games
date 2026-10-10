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
    years: 3,
    topByYear: [
      {
        year: 2025,
        total: 1,
        games: [{ bggId: 9, game: "Root", rank: 1, score: 87 }],
      },
    ],
  },
  totalPlays: 120,
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

  it("shows the name and the years and total plays tiles", () => {
    set({ status: "ready", profile: base });
    renderWithMantine(<PublicProfile discordId="5" />);

    expect(screen.getByRole("heading", { name: "Kel" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("years of data")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("total plays")).toBeInTheDocument();
    for (const gone of [
      "wins",
      "win rate",
      "avg rank",
      "podiums",
      "Most played",
    ])
      expect(screen.queryByText(gone)).toBeNull();
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

  it("still shows total plays when no scores are linked", () => {
    set({ status: "ready", profile: { ...base, stats: null } });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("total plays")).toBeInTheDocument();
    expect(screen.queryByText("years of data")).toBeNull();
  });

  it("links to the year in review for each year", () => {
    set({ status: "ready", profile: base });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(
      screen.getByRole("link", { name: "2025 in review" }),
    ).toHaveAttribute("href", "/players/5/recap/2025");
  });

  it("has no recap links without stats or years", () => {
    set({ status: "ready", profile: { ...base, stats: null } });
    const { unmount } = renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.queryByText(/in review/)).toBeNull();
    unmount();
    set({
      status: "ready",
      profile: { ...base, stats: { ...base.stats!, topByYear: [] } },
    });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.queryByText(/in review/)).toBeNull();
  });
});
