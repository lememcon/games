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

  it("sizes the label and bar through overridable CSS variables", () => {
    const { getByText } = renderWithMantine(<Score score={90} max={100} />);
    const bar = getByText("Great").nextElementSibling as HTMLElement;
    expect(getByText("Great").style.fontSize).toBe(
      "var(--score-font, 0.72rem)",
    );
    expect(bar.style.height).toBe("var(--score-bar-h, 8px)");
    expect(bar.style.minWidth).toBe("var(--score-bar-min, 48px)");
  });
});
