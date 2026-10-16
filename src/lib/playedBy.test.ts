import { describe, expect, it } from "vitest";

import { capPlayedBy } from "@/lib/playedBy";

const items = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("capPlayedBy", () => {
  it.each([0, 1, 6, 7])("shows all %i items", (n) => {
    expect(capPlayedBy(items(n))).toEqual({ shown: items(n), hidden: 0 });
  });

  it("hides the overflow beyond the limit", () => {
    expect(capPlayedBy(items(8))).toEqual({ shown: items(6), hidden: 2 });
  });

  it("honors a custom limit", () => {
    expect(capPlayedBy(items(5), 2)).toEqual({ shown: items(2), hidden: 3 });
    expect(capPlayedBy(items(3), 2)).toEqual({ shown: items(3), hidden: 0 });
  });

  it("does not mutate the input", () => {
    const list = items(10);
    const copy = [...list];
    capPlayedBy(list);
    expect(list).toEqual(copy);
  });
});
