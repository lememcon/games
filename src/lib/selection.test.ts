import { describe, expect, it } from "vitest";

import {
  bulkFailureMessage,
  toggleSelected,
  vetoTargets,
} from "@/lib/selection";

describe("selection", () => {
  it("toggles without mutating", () => {
    const start = new Set(["1"]);
    const added = toggleSelected(start, "2");
    expect(added).toEqual(new Set(["1", "2"]));
    expect(toggleSelected(added, "1")).toEqual(new Set(["2"]));
    expect(start).toEqual(new Set(["1"]));
  });

  it("targets numeric ids that are not already vetoed", () => {
    expect(
      vetoTargets(new Set(["1", "2", "abc", "3"]), new Set(["2"])),
    ).toEqual([1, 3]);
  });

  it("copes with no existing vetoes", () => {
    expect(vetoTargets(["5"], undefined)).toEqual([5]);
  });

  it("words the failure", () => {
    expect(bulkFailureMessage(2, 5)).toBe("2 of 5 didn't save");
  });
});
