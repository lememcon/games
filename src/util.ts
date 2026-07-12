import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Minus,
} from "lucide-react";

import type { MantineTheme } from "@mantine/core";

export const normalized_score = (score: number, max: number): number => {
  return +((score / max) * 100.0).toFixed(2);
};

export const score_icon = (normalized: number) => {
  if (normalized > 80.0) return ChevronsUp;

  if (normalized > 60.0) return ChevronUp;

  if (normalized > 40.0) return Minus;

  if (normalized > 20.0) return ChevronDown;

  return ChevronsDown;
};

// A short word for the score band. Paired with the icon and color so strength
// is conveyed by shape and text, not color alone (readable with any color
// vision).
export const score_label = (normalized: number): string => {
  if (normalized > 80.0) return "Great";

  if (normalized > 60.0) return "Good";

  if (normalized > 40.0) return "Even";

  if (normalized > 20.0) return "Low";

  return "Poor";
};

export const score_color = (theme: MantineTheme, normalized: number) => {
  if (normalized > 60.0) return theme.colors.green[7];

  if (normalized > 40.0) return theme.colors.yellow[8];

  return theme.colors.red[7];
};
