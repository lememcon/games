import { describe, expect, it } from "vitest";

import Score from "@/components/Score";
import { renderWithMantine } from "@/test/utils";

describe("Score", () => {
  it("renders the normalized percentage with its band label", () => {
    const { getByText } = renderWithMantine(<Score score={90} max={100} />);
    expect(getByText("90")).toBeInTheDocument();
    expect(getByText("Great")).toBeInTheDocument();
  });

  it("renders a low normalized score with its band label", () => {
    const { getByText } = renderWithMantine(<Score score={10} max={100} />);
    expect(getByText("10")).toBeInTheDocument();
    expect(getByText("Poor")).toBeInTheDocument();
  });
});
