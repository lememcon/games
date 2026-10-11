import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ColorPicker from "@/components/ColorPicker";
import { PALETTE } from "@/lib/colors";
import { renderWithMantine } from "@/test/utils";

const hook = vi.hoisted(() => ({
  save: vi.fn(),
  error: null as string | null,
  saving: false,
  onSaved: undefined as (() => void) | undefined,
}));
vi.mock("@/hooks/useColor", () => ({
  default: (onSaved: () => void) => {
    hook.onSaved = onSaved;
    return { save: hook.save, error: hook.error, saving: hook.saving };
  },
}));

const renderPicker = (color: string | null = null, onSaved = vi.fn()) =>
  renderWithMantine(<ColorPicker color={color} onSaved={onSaved} />);

const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("ColorPicker", () => {
  beforeEach(() => {
    hook.save.mockReset();
    hook.error = null;
    hook.saving = false;
  });

  it("offers each palette color by name plus Automatic", () => {
    renderPicker();
    for (const name of ["red", "blue", "amber", "green", "purple"])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(pressed("Automatic")).toBe("true");
    expect(pressed("red")).toBe("false");
  });

  it("marks the current color as pressed", () => {
    renderPicker(PALETTE[1]);
    expect(pressed("blue")).toBe("true");
    expect(pressed("Automatic")).toBe("false");
  });

  it("saves a selected color and confirms", async () => {
    hook.save.mockResolvedValue({ color: PALETTE[3] });
    renderPicker();
    await userEvent.click(screen.getByRole("button", { name: "green" }));

    expect(hook.save).toHaveBeenCalledWith(PALETTE[3]);
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(pressed("green")).toBe("true");
  });

  it("clears with Automatic", async () => {
    hook.save.mockResolvedValue({ color: null });
    renderPicker(PALETTE[0]);
    await userEvent.click(screen.getByRole("button", { name: "Automatic" }));

    expect(hook.save).toHaveBeenCalledWith(null);
    expect(pressed("Automatic")).toBe("true");
  });

  it("does not save when the current color is selected again", async () => {
    renderPicker(PALETTE[1]);
    await userEvent.click(screen.getByRole("button", { name: "blue" }));
    expect(hook.save).not.toHaveBeenCalled();
  });

  it("keeps the old selection and shows the error when saving fails", async () => {
    hook.save.mockResolvedValue(null);
    hook.error = "Something went wrong.";
    renderPicker(PALETTE[0]);
    await userEvent.click(screen.getByRole("button", { name: "blue" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(pressed("red")).toBe("true");
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  it("disables the buttons while saving", () => {
    hook.saving = true;
    renderPicker();
    expect(screen.getByRole("button", { name: "red" })).toBeDisabled();
  });

  it("hands the refresh callback to the hook", () => {
    const onSaved = vi.fn();
    renderPicker(null, onSaved);
    expect(hook.onSaved).toBe(onSaved);
  });
});
