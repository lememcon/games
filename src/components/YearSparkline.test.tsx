import { describe, expect, it } from "vitest";

import YearSparkline from "@/components/YearSparkline";
import { renderWithMantine } from "@/test/utils";

describe("YearSparkline", () => {
  it("draws the series with an accessible label", () => {
    const { getByRole } = renderWithMantine(
      <YearSparkline
        series={[
          { year: 2024, total: 10 },
          { year: 2025, total: 20 },
        ]}
      />,
    );
    const svg = getByRole("img");
    expect(svg).toHaveAttribute(
      "aria-label",
      "Total score by year, 2024 to 2025: 2024 10, 2025 20",
    );
    expect(svg.querySelector("polyline")).toHaveAttribute(
      "points",
      "2,30 118,2",
    );
  });

  it.each([[[]], [[{ year: 2025, total: 5 }]]])(
    "renders nothing for fewer than two years: %j",
    (series) => {
      const { container } = renderWithMantine(
        <YearSparkline series={series} />,
      );
      expect(container.querySelector("svg")).toBeNull();
    },
  );
});
