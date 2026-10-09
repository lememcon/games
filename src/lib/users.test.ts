import { describe, expect, it } from "vitest";

import { splitUsers, timeAgo } from "@/lib/users";
import type { AdminUser } from "@/types";

const user = (discordId: string, status: AdminUser["status"]): AdminUser => ({
  discordId,
  name: discordId,
  image: null,
  username: discordId,
  role: "member",
  status,
  locked: false,
  createdAt: "2026-01-01T00:00:00Z",
});

describe("splitUsers", () => {
  it("separates pending from approved", () => {
    const { pending, members } = splitUsers([
      user("a", "pending"),
      user("b", "approved"),
    ]);
    expect(pending.map((u) => u.discordId)).toEqual(["a"]);
    expect(members.map((u) => u.discordId)).toEqual(["b"]);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-01-10T12:00:00Z");
  it.each([
    ["2026-01-10T11:59:40Z", "just now"],
    ["2026-01-10T11:30:00Z", "30m ago"],
    ["2026-01-10T10:00:00Z", "2h ago"],
    ["2026-01-08T12:00:00Z", "2d ago"],
    ["2026-01-11T12:00:00Z", "just now"],
  ])("%s -> %s", (iso, out) => {
    expect(timeAgo(iso, now)).toBe(out);
  });
});
