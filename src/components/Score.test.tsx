import { describe, expect, it } from "vitest";

import { renderWithMantine } from "@/test/utils";
import { Score } from "@/util";

describe("Score", () => {
  it("renders the normalized percentage", () => {
    const { getByText } = renderWithMantine(<Score score={90} max={100} />);
    expect(getByText("90")).toBeInTheDocument();
  });

  it("renders a low normalized score", () => {
    const { getByText } = renderWithMantine(<Score score={10} max={100} />);
    expect(getByText("10")).toBeInTheDocument();
  });
});
