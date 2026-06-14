import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Minus,
} from "lucide-react";

import { useMantineTheme } from "@mantine/core";

export const normalized_score = (score, max) => {
  return +((score / max) * 100.0).toFixed(2);
};

export const score_icon = (normalized) => {
  if (normalized > 80.0) return ChevronsUp;

  if (normalized > 60.0) return ChevronUp;

  if (normalized > 40.0) return Minus;

  if (normalized > 20.0) return ChevronDown;

  return ChevronsDown;
};

export const score_color = (theme, normalized) => {
  if (normalized > 80.0) return theme.colors.green[7];

  if (normalized > 60.0) return theme.colors.green[7];

  if (normalized > 40.0) return theme.colors.blue[5];

  if (normalized > 20.0) return theme.colors.red[7];

  return theme.colors.red[7];
};

export const Score = ({ score, max }) => {
  const theme = useMantineTheme();
  const normalized = normalized_score(score, max);
  const Icon = score_icon(normalized);
  const color = score_color(theme, normalized);

  return (
    <div style={{ display: "flex" }}>
      <Icon strokeWidth={3} style={{ color }} />
      {normalized_score(score, max)}
    </div>
  );
};
