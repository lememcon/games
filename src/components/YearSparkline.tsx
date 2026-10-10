import { Text } from "@mantine/core";

import {
  SPARK_HEIGHT,
  SPARK_WIDTH,
  sparklinePoints,
  type YearPoint,
} from "@/lib/yearTotals";

interface YearSparklineProps {
  series: YearPoint[];
}

// A game's total score per year as a small line. Hidden under two years, as a
// single point shows no trend.
const YearSparkline = ({ series }: YearSparklineProps) => {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const label = `Total score by year, ${first.year} to ${last.year}: ${series
    .map((p) => `${p.year} ${p.total}`)
    .join(", ")}`;

  return (
    <div style={{ marginTop: "1em" }}>
      <Text size="sm" c="dimmed">
        Total score by year
      </Text>
      <svg
        role="img"
        aria-label={label}
        width={SPARK_WIDTH}
        height={SPARK_HEIGHT}
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      >
        <title>{label}</title>
        <polyline
          points={sparklinePoints(series)}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

export default YearSparkline;
