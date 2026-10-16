import { describe, expect, it, vi } from "vitest";

import { switchVeto } from "@/lib/vetoSwitch";

const scope = (veto = true, unveto = true) => ({
  veto: vi.fn().mockResolvedValue(veto),
  unveto: vi.fn().mockResolvedValue(unveto),
});

describe("switchVeto", () => {
  it("adds in the target before removing from the source", async () => {
    const from = scope();
    const to = scope();
    expect(await switchVeto(from, to, 7)).toBe(true);
    expect(to.veto).toHaveBeenCalledWith(7);
    expect(from.unveto).toHaveBeenCalledWith(7);
    expect(to.veto.mock.invocationCallOrder[0]).toBeLessThan(
      from.unveto.mock.invocationCallOrder[0],
    );
    expect(from.veto).not.toHaveBeenCalled();
    expect(to.unveto).not.toHaveBeenCalled();
  });

  it("leaves the source alone when the add fails", async () => {
    const from = scope();
    const to = scope(false);
    expect(await switchVeto(from, to, 7)).toBe(false);
    expect(from.unveto).not.toHaveBeenCalled();
  });

  it("resolves false when the removal fails", async () => {
    const from = scope(true, false);
    const to = scope();
    expect(await switchVeto(from, to, 7)).toBe(false);
    expect(to.veto).toHaveBeenCalledOnce();
  });
});
