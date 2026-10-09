import { describe, expect, it } from "vitest";

import { MAX_DISPLAY_NAME, displayNameError } from "@/lib/profile";

describe("displayNameError", () => {
  it("accepts blank, short and maximum-length names", () => {
    expect(displayNameError("")).toBeNull();
    expect(displayNameError("  Kel ")).toBeNull();
    expect(displayNameError("a".repeat(MAX_DISPLAY_NAME))).toBeNull();
  });

  it("rejects names over the limit", () => {
    expect(displayNameError("a".repeat(MAX_DISPLAY_NAME + 1))).toMatch(/32/);
  });

  it("counts code points, not UTF-16 units", () => {
    expect(displayNameError("😀".repeat(MAX_DISPLAY_NAME))).toBeNull();
  });
});
