import { describe, expect, it } from "vitest";

import { CUSTOM_IMAGE } from "./customImage";

describe("CUSTOM_IMAGE", () => {
  it("is the custom sentinel", () => {
    expect(CUSTOM_IMAGE).toBe("custom");
  });
});
