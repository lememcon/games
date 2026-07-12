import { describe, expect, it } from "vitest";

import BackButton from "@/components/BackButton";
import { renderWithMantine } from "@/test/utils";

describe("BackButton", () => {
  it("links back to the home route", () => {
    const { getByRole } = renderWithMantine(<BackButton />);
    expect(getByRole("link")).toHaveAttribute("href", "/");
  });

  it("applies a passed style to the button", () => {
    const { getByRole } = renderWithMantine(
      <BackButton style={{ marginTop: "2em" }} />,
    );
    expect(getByRole("button")).toHaveStyle({ marginTop: "2em" });
  });
});
