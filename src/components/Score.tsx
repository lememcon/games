import { createElement } from "react";

import { useMantineTheme } from "@mantine/core";

import { normalized_score, score_color, score_icon } from "@/util";

const Score = ({ score, max }: { score: number; max: number }) => {
  const theme = useMantineTheme();
  const normalized = normalized_score(score, max);
  const color = score_color(theme, normalized);

  return (
    <div style={{ display: "flex" }}>
      {createElement(score_icon(normalized), {
        strokeWidth: 3,
        style: { color },
      })}
      {normalized_score(score, max)}
    </div>
  );
};

export default Score;
