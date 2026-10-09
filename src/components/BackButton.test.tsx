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

  it("accepts a custom label", () => {
    const { getByRole } = renderWithMantine(
      <BackButton label="Back to scores" />,
    );
    expect(getByRole("link")).toHaveTextContent("Back to scores");
  });

  it("applies a passed style to the link", () => {
    const { getByRole } = renderWithMantine(
      <BackButton style={{ marginTop: "2em" }} />,
    );
    expect(getByRole("link").style.marginTop).toBe("2em");
  });
});
