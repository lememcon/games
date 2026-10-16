import { afterEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "@/components/ProfilePage";
import { renderWithMantine } from "@/test/utils";
import type { ApprovedUser } from "@/types";

const user: ApprovedUser = {
  discordId: "9",
  name: "Sam",
  displayName: null,
  discordName: "sam#1",
} as ApprovedUser;

const body = (path: string): unknown => {
  if (path.startsWith("/api/years"))
    return path.includes("/scores")
      ? { player_game_scores: [] }
      : { years: [2025] };
  if (path === "/api/games") return {};
  return { vetoes: [], overrides: [], played: {} };
};

describe("profile page data fetching", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests /api/years and /api/games once, and not again after remount", async () => {
    const f = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(new Response(JSON.stringify(body(String(input))))),
    );
    vi.stubGlobal("fetch", f);
    const count = (p: string) =>
      f.mock.calls.filter((c) => String(c[0]) === p).length;

    const first = renderWithMantine(
      <ProfilePage user={user} onSaved={() => {}} />,
    );
    await vi.waitFor(() => expect(count("/api/games")).toBe(1));
    await vi.waitFor(() => expect(count("/api/years")).toBe(1));
    first.unmount();

    renderWithMantine(<ProfilePage user={user} onSaved={() => {}} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(count("/api/games")).toBe(1);
    expect(count("/api/years")).toBe(1);
  });
});
