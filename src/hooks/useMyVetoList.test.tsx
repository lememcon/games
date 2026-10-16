import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useMyVetoList from "@/hooks/useMyVetoList";
import { ApiError } from "@/lib/api";
import { GENERIC_ERROR } from "@/lib/apiErrors";

type Item = { bggId: number };
const a = [{ bggId: 1 }];
const b = [{ bggId: 1 }, { bggId: 2 }];

const setup = (lists: Array<Item[] | Error>) => {
  const list = vi.fn();
  lists.forEach((l) =>
    list.mockImplementationOnce(() =>
      l instanceof Error ? Promise.reject(l) : Promise.resolve({ vetoes: l }),
    ),
  );
  const fetchImpl = vi.fn() as unknown as typeof fetch;
  const pick = () => list;
  const hook = renderHook(() => useMyVetoList<Item>(fetchImpl, pick));
  return { list, hook };
};

describe("useMyVetoList", () => {
  it("loads the list", async () => {
    const { hook } = setup([a]);
    expect(hook.result.current.loading).toBe(true);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.vetoes).toEqual(a);
    expect(hook.result.current.error).toBeNull();
  });

  it("reports a failed load", async () => {
    const { hook } = setup([new Error("x")]);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.vetoes).toEqual([]);
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
  });

  it("calls the list once across rerenders", async () => {
    const { list, hook } = setup([a]);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    hook.rerender();
    hook.rerender();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("refetches after a mutation and resolves true", async () => {
    const { hook } = setup([a, b]);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.result.current.mutate(async () => {});
    });
    expect(ok).toBe(true);
    expect(hook.result.current.vetoes).toEqual(b);
  });

  it("is saving while a mutation runs and ignores a second one", async () => {
    const { hook } = setup([a, b]);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const first = vi.fn(() => gate);
    const second = vi.fn(async () => {});
    let pending: Promise<boolean> | undefined;
    act(() => {
      pending = hook.result.current.mutate(first);
    });
    await waitFor(() => expect(hook.result.current.saving).toBe(true));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.result.current.mutate(second);
    });
    expect(ok).toBe(false);
    expect(second).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await pending;
    });
    expect(hook.result.current.saving).toBe(false);
    expect(hook.result.current.vetoes).toEqual(b);
  });

  it("maps known errors, falls back otherwise, and clears on the next mutate", async () => {
    const { hook } = setup([a, a]);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.result.current.mutate(() =>
        Promise.reject(new ApiError(404, "unknown_game")),
      );
    });
    expect(ok).toBe(false);
    expect(hook.result.current.error).toBe("That game no longer exists.");
    await act(async () => {
      await hook.result.current.mutate(() => Promise.reject(new Error("x")));
    });
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
    await act(async () => {
      await hook.result.current.mutate(async () => {});
    });
    expect(hook.result.current.error).toBeNull();
  });

  it("does not update after unmounting before the load settles", async () => {
    let resolve: (v: { vetoes: Item[] }) => void = () => {};
    const list = vi.fn(
      () => new Promise<{ vetoes: Item[] }>((r) => (resolve = r)),
    );
    const pick = () => list;
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const hook = renderHook(() => useMyVetoList<Item>(fetchImpl, pick));
    hook.unmount();
    await act(async () => resolve({ vetoes: a }));
    expect(hook.result.current.vetoes).toEqual([]);
    expect(hook.result.current.loading).toBe(true);
  });
});
