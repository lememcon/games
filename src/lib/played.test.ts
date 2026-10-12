import { describe, expect, it } from "vitest";

import { toPlayedMap } from "@/lib/played";

describe("toPlayedMap", () => {
  it("maps each id to 1", () => {
    expect(toPlayedMap(["1", "2"])).toEqual({ "1": 1, "2": 1 });
  });

  it("reads a missing list as empty", () => {
    expect(toPlayedMap(undefined)).toEqual({});
  });
});
