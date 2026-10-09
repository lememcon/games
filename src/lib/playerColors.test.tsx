import { renderHook } from "@testing-library/react";
import { useContext } from "react";
import { describe, expect, it } from "vitest";

import { PlayerColorContext, PlayerColorProvider } from "@/lib/playerColors";

describe("PlayerColorContext", () => {
  it("is empty by default", () => {
    const { result } = renderHook(() => useContext(PlayerColorContext));
    expect(result.current).toEqual({});
  });

  it("serves the provided map", () => {
    const { result } = renderHook(() => useContext(PlayerColorContext), {
      wrapper: ({ children }) => (
        <PlayerColorProvider value={{ alice: "#fff" }}>
          {children}
        </PlayerColorProvider>
      ),
    });
    expect(result.current).toEqual({ alice: "#fff" });
  });
});
