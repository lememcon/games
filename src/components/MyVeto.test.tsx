import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MyVeto from "@/components/MyVeto";
import { renderWithMantine } from "@/test/utils";

const setup = (over: Partial<Parameters<typeof MyVeto>[0]> = {}) => {
  const onChange = vi.fn();
  renderWithMantine(
    <MyVeto
      vetoed={false}
      saving={false}
      error={null}
      onChange={onChange}
      {...over}
    />,
  );
  return onChange;
};

describe("MyVeto", () => {
  it("vetoes when switched on", async () => {
    const onChange = setup();
    expect(screen.getByText(/linked to your account/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Not for me" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("undoes when switched off", async () => {
    const onChange = setup({ vetoed: true });
    const toggle = screen.getByRole("switch", { name: "Not for me" });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("is disabled while saving and shows an error", () => {
    setup({ saving: true, error: "Nope" });
    expect(screen.getByRole("switch", { name: "Not for me" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Nope");
  });
});
