import { describe, expect, it } from "vitest";

import StatTile from "@/components/StatTile";
import { renderWithMantine } from "@/test/utils";

describe("StatTile", () => {
  it("shows the value and its label", () => {
    const { getByText } = renderWithMantine(
      <StatTile label="wins" value="11" />,
    );
    expect(getByText("11")).toBeInTheDocument();
    expect(getByText("wins")).toBeInTheDocument();
  });
});
