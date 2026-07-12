import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PlayedCounter from "@/components/PlayedCounter";
import { renderWithMantine } from "@/test/utils";

describe("PlayedCounter", () => {
  it("reads Not Played and disables decrement at zero", () => {
    const { getByText, getByRole } = renderWithMantine(
      <PlayedCounter count={0} onInc={() => {}} onDec={() => {}} />,
    );

    expect(getByText("Not Played")).toBeInTheDocument();
    expect(getByRole("button", { name: "-" })).toBeDisabled();
    expect(getByRole("button", { name: "+" })).toBeEnabled();
  });

  it("labels the count once a game has been played", () => {
    const { getByText } = renderWithMantine(
      <PlayedCounter count={2} onInc={() => {}} onDec={() => {}} />,
    );

    expect(getByText("Played 2×")).toBeInTheDocument();
  });

  it("fires onInc and onDec when the buttons are clicked", async () => {
    const user = userEvent.setup();
    const onInc = vi.fn();
    const onDec = vi.fn();
    const { getByRole } = renderWithMantine(
      <PlayedCounter count={2} onInc={onInc} onDec={onDec} />,
    );

    await user.click(getByRole("button", { name: "+" }));
    await user.click(getByRole("button", { name: "-" }));

    expect(onInc).toHaveBeenCalledOnce();
    expect(onDec).toHaveBeenCalledOnce();
  });
});
