import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MantineProvider } from "@mantine/core";

import SelectBar from "@/components/SelectBar";
import { renderWithMantine } from "@/test/utils";

describe("SelectBar", () => {
  it("shows the count in a polite live region", () => {
    const { getByText } = renderWithMantine(
      <SelectBar
        year="2026"
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
        year="2026"
        count={0}
        disabled={false}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      getByRole("button", { name: "Not for me · every year" }),
    ).toBeDisabled();
    expect(getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("disables apply while saving", () => {
    const { getByRole } = renderWithMantine(
      <SelectBar
        year="2026"
        count={2}
        disabled
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      getByRole("button", { name: "Not for me · every year" }),
    ).toBeDisabled();
  });

  it("disables Cancel while saving", () => {
    const { getByRole } = renderWithMantine(
      <SelectBar
        year="2026"
        count={2}
        disabled
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("disables both apply buttons at zero and while saving", () => {
    const { getByRole, rerender } = renderWithMantine(
      <SelectBar
        year="2026"
        count={0}
        disabled={false}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByRole("button", { name: "Not in 2026" })).toBeDisabled();
    rerender(
      <MantineProvider>
        <SelectBar
          year="2026"
          count={2}
          disabled
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(getByRole("button", { name: "Not in 2026" })).toBeDisabled();
    expect(
      getByRole("button", { name: "Not for me · every year" }),
    ).toBeDisabled();
  });

  it("hides the year button when showYear is false", () => {
    const { queryByRole } = renderWithMantine(
      <SelectBar
        year="2026"
        showYear={false}
        count={2}
        disabled={false}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(queryByRole("button", { name: "Not in 2026" })).toBeNull();
  });

  it("forwards clicks with their scope", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const { getByRole } = renderWithMantine(
      <SelectBar
        year="2026"
        count={2}
        disabled={false}
        onApply={onApply}
        onCancel={onCancel}
      />,
    );
    await user.click(getByRole("button", { name: "Not for me · every year" }));
    expect(onApply).toHaveBeenLastCalledWith("all");
    await user.click(getByRole("button", { name: "Not in 2026" }));
    expect(onApply).toHaveBeenLastCalledWith("year");
    await user.click(getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
