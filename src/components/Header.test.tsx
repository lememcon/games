import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@mantine/core";

import Header from "@/components/Header";
import { renderWithMantine } from "@/test/utils";

const renderHeader = (props: Partial<ComponentProps<typeof Header>> = {}) =>
  renderWithMantine(
    <AppShell header={{ height: 60 }}>
      <Header
        year="2025"
        years={["2025", "2026"]}
        onYearChange={() => {}}
        {...props}
      />
    </AppShell>,
  );

describe("Header", () => {
  it("shows the current year in the selector", () => {
    const { getByRole } = renderHeader();
    expect(getByRole("textbox")).toHaveValue("2025");
  });

  it("fires onYearChange when a different year is picked", async () => {
    const user = userEvent.setup();
    const onYearChange = vi.fn();
    const { getByRole, getByText } = renderHeader({ onYearChange });

    await user.click(getByRole("textbox"));
    await user.click(getByText("2026"));

    expect(onYearChange).toHaveBeenCalledWith("2026", expect.anything());
  });
});
