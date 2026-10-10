import type { YearTotal } from "@/types";

export interface YearPoint {
  year: number;
  total: number;
}

// A game's totals by year, ascending.
export const seriesFor = (totals: YearTotal[], bggId: number): YearPoint[] =>
  totals
    .filter((t) => t.bgg_id === bggId)
    .map(({ year, total }) => ({ year, total }))
    .sort((a, b) => a.year - b.year);

export const SPARK_WIDTH = 120;
export const SPARK_HEIGHT = 32;

// SVG polyline points for the series, scaled to fit with a 2px margin. Years
// are spaced by value, so a gap year shows as a longer segment. Needs 2+ points.
export const sparklinePoints = (
  series: YearPoint[],
  width = SPARK_WIDTH,
  height = SPARK_HEIGHT,
): string => {
  const pad = 2;
  const years = series.map((p) => p.year);
  const totals = series.map((p) => p.total);
  const [x0, x1] = [Math.min(...years), Math.max(...years)];
  const [y0, y1] = [Math.min(...totals), Math.max(...totals)];
  const x = (v: number) =>
    pad + (x1 === x0 ? 0 : ((v - x0) / (x1 - x0)) * (width - 2 * pad));
  // A flat series sits mid-height; higher totals are higher on screen.
  const y = (v: number) =>
    y1 === y0
      ? height / 2
      : height - pad - ((v - y0) / (y1 - y0)) * (height - 2 * pad);
  return series.map((p) => `${x(p.year)},${y(p.total)}`).join(" ");
};
