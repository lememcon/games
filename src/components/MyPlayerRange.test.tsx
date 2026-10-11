import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MantineProvider } from "@mantine/core";

import MyPlayerRange from "@/components/MyPlayerRange";
import { renderWithMantine } from "@/test/utils";
import type { Bounds } from "@/types";

const setup = (
  props: Partial<React.ComponentProps<typeof MyPlayerRange>> = {},
) => {
  const onSave = vi.fn();
  const onReset = vi.fn();
  const allowed: Bounds = { min: 2, max: 6 };
  const view = renderWithMantine(
    <MyPlayerRange
      allowed={allowed}
      stored={null}
      saving={false}
      error={null}
      onSave={onSave}
      onReset={onReset}
      {...props}
    />,
  );
  return { ...view, onSave, onReset };
};

const min = (v: ReturnType<typeof setup>) =>
  v.getByRole("textbox", { name: "Minimum players" });
const max = (v: ReturnType<typeof setup>) =>
  v.getByRole("textbox", { name: "Maximum players" });

describe("MyPlayerRange", () => {
  it("starts at the allowed range with Save and Reset off", () => {
    const v = setup();
    expect(min(v)).toHaveValue("2");
    expect(max(v)).toHaveValue("6");
    expect(v.getByText("Allowed now: 2-6")).toBeInTheDocument();
    expect(v.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(v.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(v.queryByText("Your override")).toBeNull();
  });

  it("saves a narrowed range", async () => {
    const user = userEvent.setup();
    const v = setup();
    await user.clear(max(v));
    await user.type(max(v), "4");
    await user.click(v.getByRole("button", { name: "Save" }));
    expect(v.onSave).toHaveBeenCalledWith({ min: 2, max: 4 });
  });

  it("refuses a wider range and says why", async () => {
    const user = userEvent.setup();
    const v = setup();
    await user.clear(max(v));
    await user.type(max(v), "8");
    expect(
      v.getByText("Must stay within 2-6 (can't widen)"),
    ).toBeInTheDocument();
    expect(v.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(max(v)).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a stored range as-is, even a stale one, and resets it", async () => {
    const user = userEvent.setup();
    const v = setup({ stored: { min: 1, max: 9 } });
    expect(min(v)).toHaveValue("1");
    expect(max(v)).toHaveValue("9");
    expect(v.getByText("Your override")).toBeInTheDocument();
    expect(
      v.getByText("Must stay within 2-6 (can't widen)"),
    ).toBeInTheDocument();
    expect(v.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(v.getByRole("button", { name: "Reset" })).toBeEnabled();
    await user.click(v.getByRole("button", { name: "Reset" }));
    expect(v.onReset).toHaveBeenCalled();
  });

  it("shows the new stored range when it changes", () => {
    const v = setup({ stored: { min: 3, max: 4 } });
    expect(min(v)).toHaveValue("3");
    v.rerender(
      <MantineProvider>
        <MyPlayerRange
          key="5-6"
          allowed={{ min: 2, max: 6 }}
          stored={{ min: 5, max: 6 }}
          saving={false}
          error={null}
          onSave={v.onSave}
          onReset={v.onReset}
        />
      </MantineProvider>,
    );
    expect(min(v)).toHaveValue("5");
    expect(max(v)).toHaveValue("6");
  });

  it("shows a server error", () => {
    const v = setup({ error: "Your account isn't linked." });
    expect(v.getByRole("alert")).toHaveTextContent("isn't linked");
  });

  it("hides the heading and help when compact", () => {
    const v = setup({ compact: true });
    expect(v.queryByText("Your player count")).toBeNull();
    expect(v.queryByText(/Only suggest this game/)).toBeNull();
    expect(min(v)).toBeInTheDocument();
    expect(v.getByText("Allowed now: 2-6")).toBeInTheDocument();
  });

  it("names the game in the input labels", () => {
    const v = setup({ gameName: "Azul" });
    expect(
      v.getByRole("textbox", { name: "Minimum players for Azul" }),
    ).toBeInTheDocument();
    expect(
      v.getByRole("textbox", { name: "Maximum players for Azul" }),
    ).toBeInTheDocument();
  });

  it("gives each instance its own error id", async () => {
    const user = userEvent.setup();
    const v = setup({ gameName: "A" });
    const w = renderWithMantine(
      <MyPlayerRange
        allowed={{ min: 2, max: 6 }}
        stored={null}
        saving={false}
        error={null}
        onSave={vi.fn()}
        onReset={vi.fn()}
        gameName="B"
      />,
    );
    const a = v.getByRole("textbox", { name: "Maximum players for A" });
    const b = w.getByRole("textbox", { name: "Maximum players for B" });
    await user.clear(a);
    await user.type(a, "9");
    await user.clear(b);
    await user.type(b, "9");
    expect(a.getAttribute("aria-describedby")).not.toBe(
      b.getAttribute("aria-describedby"),
    );
  });
});
