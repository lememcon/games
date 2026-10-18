import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PublicProfile from "@/components/PublicProfile";
import type { ProfileState } from "@/hooks/useProfile";
import { headValue, resetHead } from "@/test/head";
import { renderWithMantine } from "@/test/utils";
import type { Profile } from "@/types";

const hook = vi.hoisted(() => ({
  state: { status: "loading" } as unknown,
  useProfile: vi.fn(),
  games: { games: {}, loading: false, error: false } as unknown,
}));
vi.mock("@/hooks/useGames", () => ({ default: () => hook.games }));
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
  gamesPlayed: 120,
  vetoes: [],
  yearVetoes: [],
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

  it("tolerates a profile from an older API without veto lists", () => {
    const { vetoes: _v, yearVetoes: _y, ...legacy } = base;
    set({ status: "ready", profile: legacy as Profile });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.getByRole("heading", { name: "Kel" })).toBeInTheDocument();
  });

  it("shows a cover on the top games from the games data", () => {
    hook.games = {
      games: { "9": { image: "https://example.com/9.jpg" } },
      loading: false,
      error: false,
    };
    set({ status: "ready", profile: base });
    const { container } = renderWithMantine(<PublicProfile discordId="5" />);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/9.jpg",
    );
    hook.games = { games: {}, loading: false, error: false };
  });

  it("shows the name and the years and games played tiles", () => {
    set({ status: "ready", profile: base });
    renderWithMantine(<PublicProfile discordId="5" />);

    expect(screen.getByRole("heading", { name: "Kel" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("years of data")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("games played")).toBeInTheDocument();
    for (const gone of [
      "wins",
      "win rate",
      "avg rank",
      "podiums",
      "Most played",
    ])
      expect(screen.queryByText(gone)).toBeNull();
  });

  it("wraps an unbreakable name", () => {
    set({ status: "ready", profile: { ...base, name: "A".repeat(60) } });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.getByRole("heading", { name: "A".repeat(60) })).toHaveStyle({
      overflowWrap: "anywhere",
    });
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

  it("still shows games played when no scores are linked", () => {
    set({ status: "ready", profile: { ...base, stats: null } });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("games played")).toBeInTheDocument();
    expect(screen.queryByText("years of data")).toBeNull();
  });

  it("links to the year in review for each year", () => {
    set({ status: "ready", profile: base });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(
      screen.getByRole("link", { name: "2025 in review" }),
    ).toHaveAttribute("href", "/players/5/recap/2025");
  });

  it("lists permanent and year vetoes read-only, newest year first", () => {
    set({
      status: "ready",
      profile: {
        ...base,
        vetoes: [
          { bggId: 1, name: "Catan", image: "https://example.com/c.jpg" },
        ],
        yearVetoes: [
          { year: 2025, bggId: 2, name: "Wingspan" },
          { year: 2026, bggId: 3, name: "Brass" },
          { year: 2026, bggId: 4, name: null },
        ],
      },
    });
    const { container } = renderWithMantine(<PublicProfile discordId="5" />);
    expect(
      container.querySelector("img[src='https://example.com/c.jpg']"),
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Vetoed games" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Catan")).toBeInTheDocument();
    const years = screen
      .getAllByRole("heading", { name: /^Vetoed in / })
      .map((h) => h.textContent);
    expect(years).toEqual(["Vetoed in 2026", "Vetoed in 2025"]);
    expect(screen.getByText("Brass")).toBeInTheDocument();
    expect(screen.getByText("Game 4")).toBeInTheDocument();
    expect(screen.getByText("Wingspan")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "Catan" })).toHaveAttribute(
      "href",
      "/games/1",
    );
    expect(screen.getByRole("link", { name: "Brass" })).toHaveAttribute(
      "href",
      "/2026/games/3",
    );
    expect(screen.getByRole("link", { name: "Wingspan" })).toHaveAttribute(
      "href",
      "/2025/games/2",
    );
  });

  describe("veto covers", () => {
    const section = (name: string) =>
      screen.getByRole("heading", { name }).parentElement as HTMLElement;
    const show = (extra: Partial<Profile>) => {
      set({ status: "ready", profile: { ...base, ...extra } });
      renderWithMantine(<PublicProfile discordId="5" />);
    };

    it("prefers the mirrored cover for permanent and year vetoes", () => {
      hook.games = {
        games: {
          "7": { image: null, cover: "https://cdn.example.com/7.webp" },
          "8": { image: null, cover: "https://cdn.example.com/8.webp" },
        },
        loading: false,
        error: false,
      };
      show({
        vetoes: [
          {
            bggId: 7,
            name: "Azul",
            image: "https://example.com/a.jpg",
            ext: ".jpg",
          },
        ],
        yearVetoes: [
          {
            year: 2026,
            bggId: 8,
            name: "Brass",
            image: "https://example.com/b.jpg",
          },
        ],
      });
      expect(section("Vetoed games").querySelector("img")).toHaveAttribute(
        "src",
        "https://cdn.example.com/7.webp",
      );
      expect(section("Vetoed in 2026").querySelector("img")).toHaveAttribute(
        "src",
        "https://cdn.example.com/8.webp",
      );
      hook.games = { games: {}, loading: false, error: false };
    });

    it("falls back to the https image for a year veto without an ext", () => {
      show({
        yearVetoes: [
          {
            year: 2025,
            bggId: 2,
            name: "Wingspan",
            image: "https://example.com/w.jpg",
          },
        ],
      });
      expect(section("Vetoed in 2025").querySelector("img")).toHaveAttribute(
        "src",
        "https://example.com/w.jpg",
      );
    });

    it("shows a blank square for a year veto with no cover", () => {
      show({
        yearVetoes: [{ year: 2024, bggId: 4, name: "Root" }],
      });
      const el = section("Vetoed in 2024");
      expect(el.querySelector("img")).toBeNull();
      expect(el.querySelectorAll(".tray-cover__blank")).toHaveLength(1);
    });

    it("shows a blank square for an unmatched ext and non-https image", () => {
      show({
        yearVetoes: [
          {
            year: 2023,
            bggId: 5,
            name: "Catan",
            image: "http://example.com/c.jpg",
            ext: ".png",
          },
        ],
      });
      const el = section("Vetoed in 2023");
      expect(el.querySelector("img")).toBeNull();
      expect(el.querySelectorAll(".tray-cover__blank")).toHaveLength(1);
    });
  });

  it("hides empty veto sections", () => {
    set({ status: "ready", profile: base });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(screen.queryByText("Vetoed games")).toBeNull();
    expect(screen.queryByText(/Vetoed in/)).toBeNull();
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

afterEach(resetHead);

describe("PublicProfile page metadata", () => {
  const canonical = () => headValue('link[rel="canonical"]', "href");

  it("uses a generic title while loading and on error", () => {
    set({ status: "loading" });
    const { unmount } = renderWithMantine(<PublicProfile discordId="5" />);
    expect(document.title).toBe("Player | Lememcon Games");
    expect(canonical()).toBeNull();
    unmount();

    set({ status: "error" });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(document.title).toBe("Player | Lememcon Games");
    expect(canonical()).toBeNull();
  });

  it("titles a missing profile", () => {
    set({ status: "not_found" });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(document.title).toBe("Profile not found | Lememcon Games");
    expect(canonical()).toBeNull();
  });

  it("names a loaded profile and links its canonical", () => {
    set({ status: "ready", profile: base });
    renderWithMantine(<PublicProfile discordId="5" />);
    expect(document.title).toBe("Kel | Lememcon Games");
    expect(headValue('meta[name="description"]')).toBe(
      "Kel's LememCon profile.",
    );
    expect(canonical()).toBe("https://games.lememcon.com/players/5");
  });
});
