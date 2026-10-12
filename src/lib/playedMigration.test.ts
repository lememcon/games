import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearLegacyCounts,
  legacyKey,
  readLegacyPlayed,
} from "@/lib/playedMigration";

const store = (value: unknown, year = "2025") =>
  localStorage.setItem(
    legacyKey(year),
    typeof value === "string" ? value : JSON.stringify(value),
  );

describe("playedMigration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("scopes the key by year", () => {
    expect(legacyKey("2025")).toBe("played_counts_2025");
  });

  it("returns null when nothing is stored", () => {
    expect(readLegacyPlayed("2025")).toBeNull();
  });

  it("returns the played ids and leaves the key in place", () => {
    store({ "100": 3, "200": 1 });
    expect(readLegacyPlayed("2025")).toEqual(["100", "200"]);
    expect(localStorage.getItem(legacyKey("2025"))).not.toBeNull();
  });

  it("reads only the requested year", () => {
    store({ "100": 3 }, "2024");
    expect(readLegacyPlayed("2025")).toBeNull();
  });

  it("drops invalid entries and treats any count above zero as played", () => {
    store({
      "100": 5000,
      "101": 2,
      abc: 1,
      "0": 1,
      "2147483648": 1,
      "102": 0,
      "103": -1,
      "104": 1.5,
      "105": "2",
    });
    expect(readLegacyPlayed("2025")).toEqual(["100", "101"]);
  });

  it.each(["{broken", "null", "[1]", "3", "{}", '{"abc":1}'])(
    "clears unusable data %s",
    (raw) => {
      store(raw);
      expect(readLegacyPlayed("2025")).toBeNull();
      expect(localStorage.getItem(legacyKey("2025"))).toBeNull();
    },
  );

  it("clears the key", () => {
    store({ "100": 1 });
    clearLegacyCounts("2025");
    expect(localStorage.getItem(legacyKey("2025"))).toBeNull();
  });

  it("copes with storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readLegacyPlayed("2025")).toBeNull();
    expect(() => clearLegacyCounts("2025")).not.toThrow();
  });
});
