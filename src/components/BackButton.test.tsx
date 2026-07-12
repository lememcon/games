import { describe, expect, it } from "vitest";

import BackButton from "@/components/BackButton";
import { renderWithMantine } from "@/test/utils";

describe("BackButton", () => {
  it("links back to the home route", () => {
    const { getByRole } = renderWithMantine(<BackButton />);
    expect(getByRole("link")).toHaveAttribute("href", "/");
  });

  it("labels its destination", () => {
    const { getByRole } = renderWithMantine(<BackButton />);
    expect(getByRole("link")).toHaveTextContent("Back to games");
  });

  it("applies a passed style to the link", () => {
    const { getByRole } = renderWithMantine(
      <BackButton style={{ marginTop: "2em" }} />,
    );
    expect(getByRole("link")).toHaveStyle({ marginTop: "2em" });
  });
});
