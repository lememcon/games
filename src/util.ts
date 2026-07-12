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

export const score_color = (theme: MantineTheme, normalized: number) => {
  if (normalized > 80.0) return theme.colors.green[7];

  if (normalized > 60.0) return theme.colors.green[7];

  if (normalized > 40.0) return theme.colors.blue[5];

  if (normalized > 20.0) return theme.colors.red[7];

  return theme.colors.red[7];
};
