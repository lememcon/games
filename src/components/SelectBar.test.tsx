import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SelectBar from "@/components/SelectBar";
import { renderWithMantine } from "@/test/utils";

describe("SelectBar", () => {
  it("shows the count in a polite live region", () => {
    const { getByText } = renderWithMantine(
      <SelectBar
        count={3}
        disabled={false}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByText("3 selected")).toHaveAttribute("aria-live", "polite");
  });

  it("disables apply at zero but keeps Cancel", () => {
    const { getByRole } = renderWithMantine(
      <SelectBar
        count={0}
        disabled={false}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByRole("button", { name: "Not for me" })).toBeDisabled();
    expect(getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("disables apply while saving", () => {
    const { getByRole } = renderWithMantine(
      <SelectBar count={2} disabled onApply={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(getByRole("button", { name: "Not for me" })).toBeDisabled();
  });

  it("disables Cancel while saving", () => {
    const { getByRole } = renderWithMantine(
      <SelectBar count={2} disabled onApply={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("forwards clicks", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const { getByRole } = renderWithMantine(
      <SelectBar
        count={2}
        disabled={false}
        onApply={onApply}
        onCancel={onCancel}
      />,
    );
    await user.click(getByRole("button", { name: "Not for me" }));
    await user.click(getByRole("button", { name: "Cancel" }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
