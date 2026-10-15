import { describe, expect, it } from "vitest";

import { TABLE_MIN_WIDTH } from "./layout";

describe("layout", () => {
  it("exposes the shared table min width", () => {
    expect(TABLE_MIN_WIDTH).toBe(560);
  });
});
